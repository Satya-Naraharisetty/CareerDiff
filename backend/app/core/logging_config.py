"""Centralized logging configuration for CareerDiff.

Ensures structured, real-time, flushed terminal logging across uvicorn reload,
background workers, FastAPI HTTP endpoints, and WebSocket voice pipelines.
"""

import logging
import sys

from app.core.config import get_settings


class FlushingStreamHandler(logging.StreamHandler):
    """StreamHandler that forcibly flushes every log record immediately to the terminal."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            super().emit(record)
            self.flush()
        except Exception:
            self.handleError(record)


def setup_logging() -> None:
    """Configure console logging handlers for CareerDiff and root loggers."""
    settings = get_settings()
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)

    # Reconfigure stdout and stderr for unbuffered/immediate line buffering on Windows/Linux
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(line_buffering=True)
            except Exception:
                pass

    # Standard readable terminal format: HH:MM:SS | LEVEL   | [logger.name] message
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-7s | [%(name)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    console_handler = FlushingStreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.setLevel(log_level)

    # 1. Configure the primary 'CareerDiff' logger hierarchy
    app_logger = logging.getLogger("CareerDiff")
    app_logger.setLevel(log_level)
    app_logger.handlers.clear()
    app_logger.addHandler(console_handler)
    # Allow propagation so uvicorn's root handlers also output to standard terminal streams
    app_logger.propagate = True

    # 2. Configure root logger so all framework components reach console
    root_logger = logging.getLogger()
    if not any(isinstance(h, FlushingStreamHandler) for h in root_logger.handlers):
        root_logger.addHandler(console_handler)
    root_logger.setLevel(max(log_level, logging.INFO))

