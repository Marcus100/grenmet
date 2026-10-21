"""
Rate limiting for auth and sensitive endpoints.

- Login, password-recovery, and reset-password are rate limited (e.g. 5–10/minute per IP).
- Returns 429 Too Many Requests when the limit is exceeded.
- Uses in-memory storage per process. For multi-instance deployments,
  configure a shared store (e.g. Redis) via the limiter's storage backend.
"""

import hmac
import ipaddress

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from src.config import settings
from src.worker.config import worker_settings

VISITOR_IP_HEADER = "X-Visitor-IP"
VISITOR_SECRET_HEADER = "X-Visitor-Secret"


def visitor_address(request: Request) -> str:
    """The address to rate-limit on.

    Next.js hosts call this API server-side, so the connecting address is the
    host's, shared by every visitor. A host that presents the shared
    ``TRUSTED_WEB_SECRET`` may name the real visitor in ``X-Visitor-IP``. Without
    the secret (unset, missing or wrong) or with an unparseable address the
    header is ignored and the connecting address is used, so a spoofed header
    from an untrusted caller changes nothing.
    """
    secret = settings.TRUSTED_WEB_SECRET
    presented = request.headers.get(VISITOR_SECRET_HEADER)
    claimed = request.headers.get(VISITOR_IP_HEADER)
    if secret and presented and claimed and hmac.compare_digest(presented, secret):
        try:
            return str(ipaddress.ip_address(claimed.strip()))
        except ValueError:
            pass
    return get_remote_address(request)


# Use a shared Redis store when REDIS_URL is configured (required for correct
# rate limiting across multiple app instances); otherwise fall back to in-memory.
limiter = Limiter(
    key_func=visitor_address,
    storage_uri=worker_settings.REDIS_URL,
)
