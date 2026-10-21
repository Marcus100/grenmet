"""
Rate limiting for auth and sensitive endpoints.

- Login, password-recovery, and reset-password are rate limited (e.g. 5–10/minute per IP).
- Returns 429 Too Many Requests when the limit is exceeded.
- Uses in-memory storage per process. For multi-instance deployments,
  configure a shared store (e.g. Redis) via the limiter's storage backend.
"""

import hmac
import ipaddress
import logging

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from src.config import settings
from src.worker.config import worker_settings

VISITOR_IP_HEADER = "X-Visitor-IP"
VISITOR_SECRET_HEADER = "X-Visitor-Secret"
MIN_TRUSTED_SECRET_LENGTH = 32

logger = logging.getLogger(__name__)


def warn_if_secret_too_short() -> bool:
    """Log (never the value) when TRUSTED_WEB_SECRET is set but too short to use."""
    short = 0 < len(settings.TRUSTED_WEB_SECRET) < MIN_TRUSTED_SECRET_LENGTH
    if short:
        logger.warning(
            "TRUSTED_WEB_SECRET is shorter than 32 characters and is ignored; "
            "rate limits key on the connecting address"
        )
    return short


warn_if_secret_too_short()


def _trusted_secret() -> bytes | None:
    secret = settings.TRUSTED_WEB_SECRET
    if len(secret) < MIN_TRUSTED_SECRET_LENGTH:
        return None
    return secret.encode("utf-8")


def _parse_visitor_ip(
    claimed: str,
) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    """The claimed address as an IP (IPv4-mapped IPv6 unwrapped), or None.

    Scope IDs are rejected."""
    text = claimed.strip()
    if "%" in text:
        return None
    try:
        ip = ipaddress.ip_address(text)
    except ValueError:
        return None
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        return ip.ipv4_mapped
    return ip


def _is_auth_path(request: Request) -> bool:
    prefix = f"{settings.API_V1_STR}/auth"
    path = request.url.path
    return path == prefix or path.startswith(prefix + "/")


def _trusted_visitor_ip(
    request: Request,
) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    secret = _trusted_secret()
    presented = request.headers.get(VISITOR_SECRET_HEADER)
    claimed = request.headers.get(VISITOR_IP_HEADER)
    if not (secret and presented and claimed) or _is_auth_path(request):
        return None
    try:
        matches = hmac.compare_digest(presented.encode("utf-8"), secret)
    except UnicodeEncodeError, TypeError:
        return None
    return _parse_visitor_ip(claimed) if matches else None


def visitor_ip(request: Request) -> str:
    """The real client address, unmasked: for services that need an IP (Turnstile).

    The validated ``X-Visitor-IP`` from a trusted web host, else the connecting
    address."""
    ip = _trusted_visitor_ip(request)
    return str(ip) if ip is not None else get_remote_address(request)


def visitor_address(request: Request) -> str:
    """The address to rate-limit on.

    Next.js hosts call this API server-side, so the connecting address is the
    host's, shared by every visitor. A host that presents the shared
    ``TRUSTED_WEB_SECRET`` may name the real visitor in ``X-Visitor-IP``. Without
    the secret (unset, shorter than 32 characters, missing or wrong), with an
    unusable address, or on ``/auth`` routes (sign-in and OTP limits must not be
    choosable by a secret holder) the header is ignored and the connecting
    address is used. Any malformed header fails open to the connecting address.
    IPv6 visitors share a bucket per /64 (one subscriber can rotate through it).
    """
    ip = _trusted_visitor_ip(request)
    if ip is None:
        return get_remote_address(request)
    if isinstance(ip, ipaddress.IPv6Address):
        return str(ipaddress.ip_network(f"{ip}/64", strict=False))
    return str(ip)


# Use a shared Redis store when REDIS_URL is configured (required for correct
# rate limiting across multiple app instances); otherwise fall back to in-memory.
limiter = Limiter(
    key_func=visitor_address,
    storage_uri=worker_settings.REDIS_URL,
)
