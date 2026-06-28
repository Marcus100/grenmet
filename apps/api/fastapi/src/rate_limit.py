"""
Rate limiting for auth and sensitive endpoints.

- Login, password-recovery, and reset-password are rate limited (e.g. 5–10/minute per IP).
- Returns 429 Too Many Requests when the limit is exceeded.
- Uses in-memory storage per process. For multi-instance deployments,
  configure a shared store (e.g. Redis) via the limiter's storage backend.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from src.worker.config import worker_settings

# Use a shared Redis store when REDIS_URL is configured (required for correct
# rate limiting across multiple app instances); otherwise fall back to in-memory.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=worker_settings.REDIS_URL,
)
