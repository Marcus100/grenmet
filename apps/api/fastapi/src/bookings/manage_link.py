"""Signed manage links: a customer's way back to a booking, minted when a mail is built.

The booking stores only the SHA-256 of its random manage token, so a later mail
cannot repeat it. A signed link is minted on demand instead. It is a token of
this form::

    v1.<booking id as 32 hex>.<expires, Unix seconds>.<tag>

``tag`` is the first 16 bytes of HMAC-SHA256 over ``purpose|version|id|expires``,
URL-safe base64 without padding. The key is HKDF-SHA256 (RFC 5869) of the
application ``SECRET_KEY`` with the info string ``bookings-manage-link-v1``: a
domain-separated derivation, so the same secret that signs JWTs never signs
these directly, and the email-code key stays separate. Worker and API share the
secret (deploy compose), so a link minted by the reminder job verifies in the
API. Rotating ``SECRET_KEY`` ends every outstanding signed link; the random
legacy tokens are unaffected.

A link expires ``GRACE`` after its booking ends. The route also needs the stored
token hash to be present (retention clears it), so clearing it revokes every
link at once. A legacy random token is ``token_urlsafe``, which never contains a
dot, so :func:`is_signed` tells the two forms apart.

Pure: no database and no clock of its own (the caller passes ``now``).
"""

import base64
import hashlib
import hmac
import uuid
from datetime import UTC, datetime, timedelta

from src.auth.config import auth_settings

PURPOSE_MANAGE = "manage"
CURRENT_VERSION = "v1"
#: How long a signed link works after its booking ends.
GRACE = timedelta(days=7)
_KEY_INFO = {"v1": b"bookings-manage-link-v1"}
_TAG_BYTES = 16


def hkdf_sha256(ikm: bytes, *, salt: bytes | None, info: bytes, length: int) -> bytes:
    """RFC 5869 HKDF with SHA-256. ``salt=None`` uses HashLen zero bytes."""
    if not 0 < length <= 255 * 32:
        raise ValueError("HKDF output length out of range")
    prk = hmac.new(
        salt if salt is not None else bytes(32), ikm, hashlib.sha256
    ).digest()
    output, block, counter = b"", b"", 1
    while len(output) < length:
        block = hmac.new(prk, block + info + bytes([counter]), hashlib.sha256).digest()
        output += block
        counter += 1
    return output[:length]


def signing_key(version: str = CURRENT_VERSION) -> bytes:
    """The HMAC key for one key version, derived from ``SECRET_KEY``."""
    return hkdf_sha256(
        auth_settings.SECRET_KEY.encode(),
        salt=None,
        info=_KEY_INFO[version],
        length=32,
    )


def _epoch(moment: datetime) -> int:
    if moment.tzinfo is None:  # the database holds naive UTC
        moment = moment.replace(tzinfo=UTC)
    return int(moment.timestamp())


def _tag(purpose: str, version: str, booking_hex: str, expires: str) -> str:
    message = f"{purpose}|{version}|{booking_hex}|{expires}".encode()
    digest = hmac.new(signing_key(version), message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest[:_TAG_BYTES]).rstrip(b"=").decode()


def mint(
    booking_id: uuid.UUID, ends_at: datetime, *, purpose: str = PURPOSE_MANAGE
) -> str:
    """A signed link for ``booking_id``, valid until ``GRACE`` after ``ends_at``
    (naive UTC, as stored)."""
    expires = str(_epoch(ends_at) + int(GRACE.total_seconds()))
    booking_hex = booking_id.hex
    tag = _tag(purpose, CURRENT_VERSION, booking_hex, expires)
    return f"{CURRENT_VERSION}.{booking_hex}.{expires}.{tag}"


def is_signed(token: str) -> bool:
    """True for the signed form. A legacy random token never contains a dot."""
    return "." in token


def verify(
    token: str, *, now: datetime, purpose: str = PURPOSE_MANAGE
) -> uuid.UUID | None:
    """The booking id when ``token`` is a valid, unexpired signed link for
    ``purpose``; otherwise None. Every failure gives the same answer."""
    parts = token.split(".")
    if len(parts) != 4:
        return None
    version, booking_hex, expires, tag = parts
    if version not in _KEY_INFO or not (expires.isascii() and expires.isdigit()):
        return None
    try:
        booking_id = uuid.UUID(hex=booking_hex)
    except ValueError:
        return None
    if booking_id.hex != booking_hex:  # canonical lowercase hex only
        return None
    expected = _tag(purpose, version, booking_hex, expires)
    if not hmac.compare_digest(expected.encode(), tag.encode()):
        return None
    if _epoch(now) > int(expires):
        return None
    return booking_id
