"""FastAPI server: streams state to the browser over Server-Sent Events.

SSE protocol (``GET /api/stream``):

- ``event: snapshot`` ``{"seq", "generation", "state"}`` — always the first
  data event on a connection, and again whenever the state is replaced
  (source switch, reconnect to the feed, replay seek). Clients must replace
  their state wholesale.
- ``event: patch`` ``{"seq", "changes": {topic: delta}}`` — coalesced deltas,
  at most every ``FLUSH_INTERVAL`` seconds. Clients deep-merge ``changes``
  into their state with the same rules as :func:`f1live.merge.merge`.
- ``event: status`` — source / recorder status (see ``/api/status``).
- ``: ping`` comments keep proxies from closing idle connections.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import credentials, f1auth
from .manager import DEMO_PATH, SourceManager, list_recordings
from .state import StateStore

log = logging.getLogger(__name__)

FLUSH_INTERVAL = 0.2
PING_INTERVAL = 15.0
CLIENT_QUEUE = 64


def _sse(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


def _dumps(obj: Any) -> str:
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


class Hub:
    """Fan-out of snapshots, patches and status to connected SSE clients."""

    def __init__(self, store: StateStore, manager: SourceManager) -> None:
        self.store = store
        self.manager = manager
        self.clients: set[asyncio.Queue[str | None]] = set()
        self._generation = -1
        self._status_dirty = True
        self._task: asyncio.Task | None = None

    def mark_status(self) -> None:
        self._status_dirty = True

    def _snapshot_payload(self) -> str:
        return _sse("snapshot", _dumps({"seq": self.store.seq, "generation": self.store.generation,
                                        "state": self.store.snapshot()}))

    def status_event(self) -> str:
        return _sse("status", _dumps(self.manager.status()))

    def register(self) -> asyncio.Queue[str | None]:
        """Add a client. Its first data event is always a full snapshot."""
        q: asyncio.Queue[str | None] = asyncio.Queue(maxsize=CLIENT_QUEUE)
        # Bring existing clients up to date first so the new client's
        # snapshot and everyone's next patch line up.
        self.flush()
        q.put_nowait(self.status_event())
        q.put_nowait(self._snapshot_payload())
        self.clients.add(q)
        return q

    def unregister(self, q: asyncio.Queue[str | None]) -> None:
        self.clients.discard(q)

    def _broadcast(self, payload: str) -> None:
        for q in list(self.clients):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                # Slow client: drop its backlog and resync with a snapshot.
                # Re-applying a patch on top of a newer snapshot is harmless:
                # merges, including index-keyed list patches, are idempotent.
                while not q.empty():
                    q.get_nowait()
                q.put_nowait(self._snapshot_payload())

    def flush(self) -> None:
        if self.store.generation != self._generation:
            self._generation = self.store.generation
            self.store.drain_delta()  # superseded by the snapshot
            self._broadcast(self._snapshot_payload())
        else:
            delta = self.store.drain_delta()
            if delta:
                self._broadcast(_sse("patch", _dumps({"seq": self.store.seq, "changes": delta})))
        if self._status_dirty:
            self._status_dirty = False
            self._broadcast(self.status_event())

    async def run(self) -> None:
        tick = 0
        while True:
            await asyncio.sleep(FLUSH_INTERVAL)
            tick += 1
            try:
                self.flush()
                # Replay position moves continuously; refresh status ~1/s.
                if tick % 5 == 0 and self.manager.source is not None:
                    self._status_dirty = True
            except Exception:  # noqa: BLE001
                log.exception("hub flush failed")

    def start(self) -> None:
        self._task = asyncio.create_task(self.run(), name="hub")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        self.close_clients()

    def close_clients(self) -> None:
        """End every open SSE stream (each client then reconnects with backoff)."""
        for q in list(self.clients):
            while not q.empty():
                q.get_nowait()
            q.put_nowait(None)


# -- request models ----------------------------------------------------------
class SourceRequest(BaseModel):
    kind: str = Field(pattern="^(demo|replay|live|fastf1)$")
    file: str | None = Field(default=None, max_length=200)
    year: int | None = Field(default=None, ge=2018, le=2100)
    event: str | None = Field(default=None, max_length=80)
    session: str | None = Field(default=None, max_length=30)
    speed: float = Field(default=1.0, gt=0, le=100)
    autoplay: bool = True


class ReplayControl(BaseModel):
    action: str = Field(pattern="^(play|pause|seek|speed|toggle)$")
    value: float | None = None


class RecorderControl(BaseModel):
    enabled: bool


class CredentialsRequest(BaseModel):
    token: str = Field(max_length=credentials.MAX_LEN + 64)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=512)


def create_app(initial_source: str | None = None) -> FastAPI:
    store = StateStore()
    hub: Hub | None = None
    manager = SourceManager(store, on_status=lambda: hub.mark_status() if hub else None)
    hub = Hub(store, manager)
    credentials.load()

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        hub.start()
        choice = initial_source or os.environ.get("F1_SOURCE", "demo")
        try:
            if choice == "live":
                await manager.use_live()
            elif choice == "demo":
                await manager.use_demo()
            elif choice.endswith((".jsonl", ".jsonl.gz")):
                from pathlib import Path
                await manager.use_replay_file(Path(choice))
        except Exception as exc:  # noqa: BLE001 - start the server anyway, report in status
            log.exception("could not start initial source %r", choice)
            manager.last_error = str(exc)
        yield
        await manager.shutdown()
        await hub.stop()

    app = FastAPI(title="F1 Companion", lifespan=lifespan)
    origins = os.environ.get("F1_CORS_ORIGINS", "*").split(",")
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST", "DELETE"],
                       allow_headers=["Content-Type"])
    app.state.store, app.state.manager, app.state.hub = store, manager, hub

    @app.get("/api/health")
    async def health() -> dict:
        return {"ok": True}

    @app.get("/api/status")
    async def status() -> dict:
        return manager.status()

    @app.get("/api/state")
    async def state() -> dict:
        return {"seq": store.seq, "generation": store.generation, "state": store.snapshot()}

    @app.get("/api/sources")
    async def sources() -> dict:
        try:
            import fastf1  # noqa: F401
            ff1 = {"installed": True}
        except ImportError:
            ff1 = {"installed": False}
        ff1["credentials"] = bool(os.environ.get("F1_USERNAME") and os.environ.get("F1_PASSWORD"))
        return {"demo": {"available": DEMO_PATH.is_file(), "name": "Demo race (synthetic)"},
                "recordings": list_recordings(), "fastf1": ff1}

    @app.post("/api/source")
    async def set_source(req: SourceRequest) -> dict:
        try:
            if req.kind == "demo":
                await manager.use_demo(speed=req.speed, autoplay=req.autoplay)
            elif req.kind == "replay":
                if not req.file:
                    raise HTTPException(400, "file is required for replay")
                await manager.use_recording(req.file, speed=req.speed, autoplay=req.autoplay)
            elif req.kind == "live":
                await manager.use_live()
            elif req.kind == "fastf1":
                if not (req.year and req.event and req.session):
                    raise HTTPException(400, "year, event and session are required")
                await manager.use_fastf1(req.year, req.event, req.session, speed=req.speed)
        except HTTPException:
            raise
        except (ValueError, FileNotFoundError) as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(502, str(exc)) from exc
        return manager.status()

    @app.post("/api/replay")
    async def replay(ctl: ReplayControl) -> dict:
        src = manager.source
        if src is None or not hasattr(src, "seek"):
            raise HTTPException(409, "active source is not a replay")
        try:
            if ctl.action == "play":
                src.play()
            elif ctl.action == "pause":
                src.pause()
            elif ctl.action == "toggle":
                src.play() if (src.paused or src.ended) else src.pause()
            elif ctl.action == "seek":
                if ctl.value is None:
                    raise HTTPException(400, "value is required")
                src.seek(ctl.value)
            elif ctl.action == "speed":
                if ctl.value is None:
                    raise HTTPException(400, "value is required")
                src.set_speed(ctl.value)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        hub.mark_status()
        return manager.status()

    @app.post("/api/recorder")
    async def recorder(ctl: RecorderControl) -> dict:
        await manager.set_recording(ctl.enabled)
        return manager.status()

    async def _reapply_token() -> None:
        """The live feed reads the token when it connects, so reconnect to pick up a change."""
        src = manager.source
        if src is not None and src.kind == "live":
            await manager.use_live()
        else:
            hub.mark_status()

    @app.post("/api/credentials")
    async def save_credentials(req: CredentialsRequest) -> dict:
        try:
            credentials.save(req.token)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        await _reapply_token()
        return manager.status()

    @app.post("/api/credentials/login")
    async def login_credentials(req: LoginRequest) -> dict:
        """Sign in to F1 TV with an email and password; only the returned token is kept."""
        try:
            token = await f1auth.login(req.email.strip(), req.password)
            credentials.save(token)
        except f1auth.LoginError as exc:
            raise HTTPException(exc.status, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(502, "F1 returned a token this app can't use. Paste one manually instead.") from exc
        await _reapply_token()
        return manager.status()

    @app.delete("/api/credentials")
    async def clear_credentials() -> dict:
        credentials.clear()
        await _reapply_token()
        return manager.status()

    @app.get("/api/telemetry/{num}")
    async def telemetry(num: str, window: float = 60.0) -> dict:
        if not num.isdigit() or len(num) > 3:
            raise HTTPException(400, "invalid driver number")
        return store.telemetry(num, max(1.0, min(window, 120.0)))

    @app.get("/api/traces/{num}")
    async def traces(num: str) -> dict:
        if not num.isdigit() or len(num) > 3:
            raise HTTPException(400, "invalid driver number")
        return store.traces(num)

    @app.get("/api/stream")
    async def stream(request: Request) -> StreamingResponse:
        q = hub.register()

        async def gen() -> AsyncIterator[str]:
            try:
                yield "retry: 2000\n\n"
                while True:
                    try:
                        item = await asyncio.wait_for(q.get(), timeout=PING_INTERVAL)
                    except asyncio.TimeoutError:
                        if await request.is_disconnected():
                            break
                        yield ": ping\n\n"
                        continue
                    if item is None:
                        break
                    yield item
            finally:
                hub.unregister(q)

        headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"}
        return StreamingResponse(gen(), media_type="text/event-stream", headers=headers)

    return app
