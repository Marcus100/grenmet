"""HMAC-SHA256 helpers shared by every outbound webhook signer.

CAP webhooks sign the body (``sha256=<hex>``). Organisation webhooks sign
``<unix time>.<body>`` and send ``t=<unix>,v1=<hex>`` so receivers can reject
replays; ``verify_timestamped`` is the receiver-side check (documented for clients
and used by the tests).
"""

import hashlib
import hmac
import time

#: Default replay window a receiver should accept.
DEFAULT_TOLERANCE_SECONDS = 300


def hmac_sha256_hex(secret: str | bytes, message: bytes) -> str:
    key = secret.encode() if isinstance(secret, str) else secret
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def sign_body(secret: str | bytes, body: bytes) -> str:
    """``sha256=<hex>`` over the body (CAP's ``X-Cap-Signature``)."""
    return f"sha256={hmac_sha256_hex(secret, body)}"


def sign_timestamped(secret: str | bytes, body: bytes, timestamp: int) -> str:
    """``t=<unix>,v1=<hex>`` where the hex is the HMAC of ``<t>.<body>``."""
    signed = str(timestamp).encode() + b"." + body
    return f"t={timestamp},v1={hmac_sha256_hex(secret, signed)}"


def verify_timestamped(
    secret: str | bytes,
    body: bytes,
    header: str,
    *,
    tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS,
    now: float | None = None,
) -> bool:
    """Receiver check: well-formed header, fresh timestamp, matching signature."""
    parts = dict(part.split("=", 1) for part in header.split(",") if "=" in part)
    try:
        timestamp = int(parts["t"])
    except KeyError, ValueError:
        return False
    signature = parts.get("v1", "")
    current = time.time() if now is None else now
    if abs(current - timestamp) > tolerance_seconds:
        return False
    expected = sign_timestamped(secret, body, timestamp).split("v1=", 1)[1]
    return hmac.compare_digest(expected, signature)
