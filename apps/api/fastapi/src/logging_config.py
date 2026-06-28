"""
Logging configuration for Datadog + Sentry.

- JSON output parsed by the Datadog log forwarder
- ddtrace injects dd.trace_id / dd.span_id when DD_LOGS_INJECTION=true
- Sentry captures exceptions independently via sentry_sdk.init
- Run the app with `ddtrace-run uvicorn ...` in production for full APM tracing
"""

import logging
import os

from pythonjsonlogger.json import JsonFormatter


class _DatadogFormatter(JsonFormatter):
    """JSON formatter that includes ddtrace context fields when present."""

    def add_fields(
        self,
        log_record: dict[str, object],
        record: logging.LogRecord,
        message_dict: dict[str, object],
    ) -> None:
        super().add_fields(log_record, record, message_dict)
        # ddtrace injects these onto the LogRecord when DD_LOGS_INJECTION=true
        for field in (
            "dd.trace_id",
            "dd.span_id",
            "dd.service",
            "dd.env",
            "dd.version",
        ):
            value = record.__dict__.get(field)
            if value:
                log_record[field] = value


def configure_logging(level: str = "INFO") -> None:
    """Configure root logger with JSON output suitable for Datadog.

    Call once at application startup. In local development, set
    LOG_FORMAT=text to get human-readable output instead.
    """
    log_format = os.getenv("LOG_FORMAT", "json")
    log_level = getattr(logging, os.getenv("LOG_LEVEL", level).upper(), logging.INFO)

    handler = logging.StreamHandler()

    if log_format == "text":
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)s [%(name)s] %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S",
            )
        )
    else:
        handler.setFormatter(
            _DatadogFormatter(
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
