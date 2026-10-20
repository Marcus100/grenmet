"""
Logging configuration: structured JSON to stdout, plus Sentry.

- JSON lines on stdout, read from the container logs (no APM agent is used)
- `request_id` / `organisation_id` link a line to its request and Sentry event
- Sentry captures exceptions and error logs independently via sentry_sdk.init
"""

import logging
import os

from pythonjsonlogger.json import JsonFormatter

from src.request_context import RequestIdFilter


class _ContextJsonFormatter(JsonFormatter):
    """JSON formatter that adds request context fields when present."""

    def add_fields(
        self,
        log_record: dict[str, object],
        record: logging.LogRecord,
        message_dict: dict[str, object],
    ) -> None:
        super().add_fields(log_record, record, message_dict)
        request_id = record.__dict__.get("request_id")
        if request_id and request_id != "-":
            log_record["request_id"] = request_id
        organisation_id = record.__dict__.get("organisation_id")
        if organisation_id and organisation_id != "-":
            log_record["organisation_id"] = organisation_id


def configure_logging(level: str = "INFO") -> None:
    """Configure the root logger with structured JSON output.

    Call once at application startup. In local development, set
    LOG_FORMAT=text to get human-readable output instead.
    """
    log_format = os.getenv("LOG_FORMAT", "json")
    log_level = getattr(logging, os.getenv("LOG_LEVEL", level).upper(), logging.INFO)

    handler = logging.StreamHandler()
    handler.addFilter(RequestIdFilter())

    if log_format == "text":
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)s [%(name)s] [%(request_id)s] [%(organisation_id)s] %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S",
            )
        )
    else:
        handler.setFormatter(
            _ContextJsonFormatter(
                fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S",
            )
        )

    root = logging.getLogger()
    root.setLevel(log_level)
    root.handlers.clear()
    root.addHandler(handler)

    # Quieten noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
