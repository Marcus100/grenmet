"""Per-request correlation ID shared by logs, Sentry events and the response.

The ID is random and carries no user data, so it is safe to log, tag in Sentry
and return to the browser. A caller-supplied ``X-Request-ID`` is reused only when
it is a short, plain token; anything else is replaced, so the header cannot be
used to inject log content.
"""

import logging
import re
import uuid
from contextvars import ContextVar, Token

REQUEST_ID_HEADER = "X-Request-ID"
_VALID_INCOMING = re.compile(r"[A-Za-z0-9._-]{8,64}")
_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def resolve_request_id(incoming: str | None) -> str:
    """Reuse a well-formed incoming ID, otherwise generate a new one."""
    if incoming is not None and _VALID_INCOMING.fullmatch(incoming):
        return incoming
    return uuid.uuid4().hex


def bind_request_id(request_id: str) -> Token[str | None]:
    return _request_id.set(request_id)


def reset_request_id(token: Token[str | None]) -> None:
    _request_id.reset(token)


def current_request_id() -> str | None:
    return _request_id.get()


class RequestIdFilter(logging.Filter):
    """Attach the active request ID (or ``-``) to every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = current_request_id() or "-"
        return True
