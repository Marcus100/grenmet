"""Cloudflare Turnstile server-side verification for public forms.

``require_turnstile`` is called by the route of every public form before any
work is done. Behaviour:

- ``TURNSTILE_ENABLED`` false (default): no check, so local dev and tests work.
- Enabled but ``TURNSTILE_SECRET_KEY`` unset: fail closed with 503 and a log line.
- Enabled and the token is missing or rejected: 400 "Verification failed"
  (no detail about why).
- Cloudflare unreachable, slow or answering with an error: fail closed with 400.
  Every protected form sends email or stores visitor data, so an outage blocks
  submissions instead of letting bots through; visitors can retry.
"""

import logging

import httpx
from fastapi import Request, status
from pydantic_settings import BaseSettings, SettingsConfigDict
from slowapi.util import get_remote_address

from src.exceptions import AppException

logger = logging.getLogger(__name__)

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
_TIMEOUT_SECONDS = 5.0


class TurnstileSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    TURNSTILE_ENABLED: bool = False
    TURNSTILE_SECRET_KEY: str | None = None


turnstile_settings = TurnstileSettings()

# Test seam: an httpx transport (e.g. MockTransport) used instead of the network.
_transport: httpx.AsyncBaseTransport | None = None


class VerificationFailedError(AppException):
    def __init__(self) -> None:
        super().__init__("Verification failed", status.HTTP_400_BAD_REQUEST)


class VerificationUnavailableError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "Verification is unavailable", status.HTTP_503_SERVICE_UNAVAILABLE
        )


async def verify_turnstile(token: str | None, remote_ip: str | None) -> bool:
    """Return True when Cloudflare accepts the token. Never raises on network errors."""
    secret = turnstile_settings.TURNSTILE_SECRET_KEY
    if not secret:
        return False
    data = {"secret": secret, "response": token or ""}
    if remote_ip:
        data["remoteip"] = remote_ip
    try:
        async with httpx.AsyncClient(
            timeout=_TIMEOUT_SECONDS, transport=_transport
        ) as client:
            response = await client.post(SITEVERIFY_URL, data=data)
        response.raise_for_status()
        body = response.json()
    except httpx.HTTPError, ValueError:
        logger.warning("Turnstile siteverify unreachable or invalid; failing closed")
        return False
    return isinstance(body, dict) and body.get("success") is True


async def require_turnstile(request: Request, token: str | None) -> None:
    """Raise unless the request passes Turnstile (no-op when disabled)."""
    if not turnstile_settings.TURNSTILE_ENABLED:
        return
    if not turnstile_settings.TURNSTILE_SECRET_KEY:
        logger.error("TURNSTILE_ENABLED is true but TURNSTILE_SECRET_KEY is not set")
        raise VerificationUnavailableError
    if not token:
        raise VerificationFailedError
    if not await verify_turnstile(token, get_remote_address(request)):
        raise VerificationFailedError
