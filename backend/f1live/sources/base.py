"""Common interface for data sources.

A source is a long-running coroutine that pushes :class:`Message` objects
into a sink (normally :meth:`StateStore.apply_message`). The server and UI
never care which source is active; they only read the store and the
source's :meth:`status`.
"""

from __future__ import annotations

import abc
from typing import Any, Callable, Protocol

from ..messages import Message


class MessageSink(Protocol):
    def apply_message(self, msg: Message, heavy: bool = True) -> None: ...
    def reset(self) -> None: ...
    def invalidate(self) -> None: ...


StatusCallback = Callable[[], None]


class Source(abc.ABC):
    """Base class for live, replay and FastF1 sources."""

    kind: str = "base"

    def __init__(self, sink: MessageSink) -> None:
        self.sink = sink
        self._on_status: StatusCallback | None = None

    def on_status_change(self, cb: StatusCallback | None) -> None:
        """Register a callback fired whenever :meth:`status` changes."""
        self._on_status = cb

    def _status_changed(self) -> None:
        if self._on_status:
            self._on_status()

    @abc.abstractmethod
    async def run(self) -> None:
        """Run until stopped or exhausted. Must not raise on bad data."""

    @abc.abstractmethod
    async def stop(self) -> None:
        """Stop the source; ``run`` should return promptly."""

    @abc.abstractmethod
    def status(self) -> dict[str, Any]:
        """JSON-serialisable status, always including ``kind`` and ``state``.

        ``state`` is one of: ``idle``, ``connecting``, ``connected``,
        ``reconnecting``, ``playing``, ``paused``, ``ended``, ``error``.
        """
