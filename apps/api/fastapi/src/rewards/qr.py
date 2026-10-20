"""Signed, rotating venue QR tokens (PF9). Pure functions, no I/O.

Token: ``v1.<venue_id>.<window>.<hmac>`` where ``window`` is the unix time
divided by 60 and ``hmac`` is the first 32 hex characters of
HMAC-SHA256(venue secret, ``v1.<venue_id>.<window>``). A token is valid for its
own window and one window either side (clock skew, scan delay). The display
screen refreshes the code, so a photographed code stops working within
minutes; daily uniqueness is enforced separately by the check-in table.
"""

import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass

VERSION = "v1"
WINDOW_SECONDS = 60
TOLERANCE_WINDOWS = 1
_MAC_LENGTH = 32


@dataclass(frozen=True)
class ParsedToken:
    venue_id: uuid.UUID
    window: int
    mac: str


def new_secret() -> str:
    return secrets.token_urlsafe(32)


def window_for(timestamp: float) -> int:
    return int(timestamp // WINDOW_SECONDS)


def _mac(secret: str, venue_id: uuid.UUID, window: int) -> str:
    message = f"{VERSION}.{venue_id}.{window}".encode()
    digest = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return digest[:_MAC_LENGTH]


def make_token(secret: str, venue_id: uuid.UUID, timestamp: float) -> str:
    window = window_for(timestamp)
    return f"{VERSION}.{venue_id}.{window}.{_mac(secret, venue_id, window)}"


def parse_token(token: str) -> ParsedToken | None:
    """The token's parts, or ``None`` when it is not shaped like a token."""
    parts = token.strip().split(".")
    if len(parts) != 4 or parts[0] != VERSION:
        return None
    try:
        venue_id = uuid.UUID(parts[1])
        window = int(parts[2])
    except ValueError:
        return None
    return ParsedToken(venue_id=venue_id, window=window, mac=parts[3])


def verify_token(parsed: ParsedToken, secret: str, timestamp: float) -> bool:
    """True when the MAC matches and the window is within tolerance of now."""
    if abs(parsed.window - window_for(timestamp)) > TOLERANCE_WINDOWS:
        return False
    expected = _mac(secret, parsed.venue_id, parsed.window)
    return hmac.compare_digest(expected.encode(), parsed.mac.encode())
