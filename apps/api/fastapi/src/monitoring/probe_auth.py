"""Credential and rate limit for the uptime probe (machine caller, no user session).

Better Stack sends ``Authorization: Bearer <MONITORING_PROBE_TOKEN>`` as a request
header. The secret is never read from the URL. Order of checks: unconfigured
(404), rate limit per address (429, before any credential comparison), then the
credential (401). Same pattern as the wxwatch collector ingest token.
"""

import hmac
from typing import Annotated

from fastapi import Header, Request
from fastapi.concurrency import run_in_threadpool
from limits import parse

from src.exceptions import AuthenticationError, NotFoundError
from src.rate_limit import connecting_address, limiter

from .config import monitoring_settings
from .exceptions import ProbeRateLimitedError

_PER_ADDRESS = parse("60/minute")


async def authenticate_probe(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    expected_secret = monitoring_settings.probe_secret()
    if expected_secret is None:
        raise NotFoundError()
    if limiter.enabled:
        host = connecting_address(request) if request.client else "unknown"
        allowed = await run_in_threadpool(
            limiter.limiter.hit, _PER_ADDRESS, "monitoring-probe", host
        )
        if not allowed:
            raise ProbeRateLimitedError()
    expected = f"Bearer {expected_secret}".encode()
    if not authorization or not hmac.compare_digest(authorization.encode(), expected):
        raise AuthenticationError("Invalid probe credentials")
