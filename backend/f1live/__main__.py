"""Command line entry point.

    python -m f1live serve [--host 127.0.0.1] [--port 8000] [--source demo|live|<file.jsonl[.gz]>]
"""

from __future__ import annotations

import argparse
import logging


def main() -> None:
    parser = argparse.ArgumentParser(prog="f1live")
    sub = parser.add_subparsers(dest="cmd", required=True)
    serve = sub.add_parser("serve", help="run the API/SSE server")
    serve.add_argument("--host", default="127.0.0.1",
                       help="bind address; use 0.0.0.0 to reach it from a phone on your LAN")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--source", default=None,
                       help="initial source: demo (default), live, or a path to a .jsonl[.gz] recording")
    serve.add_argument("--log-level", default="info")
    args = parser.parse_args()

    logging.basicConfig(level=args.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    if args.cmd == "serve":
        import uvicorn

        from .server import create_app

        app = create_app(args.source)

        class Server(uvicorn.Server):
            # SSE streams never end on their own, so a graceful shutdown (Ctrl+C,
            # SIGTERM) would wait forever while any browser is open. Close them
            # first; the timeout is a fallback.
            def handle_exit(self, sig, frame):  # type: ignore[override]
                app.state.hub.close_clients()
                super().handle_exit(sig, frame)

        config = uvicorn.Config(app, host=args.host, port=args.port, log_level=args.log_level,
                                timeout_graceful_shutdown=3)
        Server(config).run()


if __name__ == "__main__":
    main()
