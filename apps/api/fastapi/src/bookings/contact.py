"""How customers reach a business by hand: normalising the profile's contact fields.

Pure functions (no database) used by the profile schema's validators. Each one
takes what a studio typed and returns the stored form, ``None`` for a blank
entry, or raises ``ValueError`` with a message the studio can act on (FastAPI
turns it into a 422).
"""

import re
from urllib.parse import urlsplit

# Spaces, dots, dashes and brackets people type inside phone numbers.
_PHONE_SEPARATORS = re.compile(r"[\s().\-]")
#: E.164: a plus, a country code that does not start with 0, at most 15 digits.
_E164 = re.compile(r"^\+[1-9][0-9]{6,14}$")
_WHATSAPP = re.compile(r"^[1-9][0-9]{6,14}$")
#: Instagram usernames: letters, digits, dots and underscores, at most 30.
_INSTAGRAM_HANDLE = re.compile(r"^[A-Za-z0-9._]{1,30}$")
_INSTAGRAM_HOSTS = frozenset({"instagram.com", "www.instagram.com", "m.instagram.com"})


def _blank_to_none(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError("Enter text")
    stripped = value.strip()
    return stripped or None


def normalise_phone(value: object) -> str | None:
    """A phone number in E.164 form (``+14734401234``), for ``tel:`` links."""
    text = _blank_to_none(value)
    if text is None:
        return None
    compact = _PHONE_SEPARATORS.sub("", text)
    if compact.startswith("00"):
        compact = f"+{compact[2:]}"
    if not _E164.fullmatch(compact):
        raise ValueError(
            "Enter the phone number with its country code, for example +1 473 440 1234"
        )
    return compact


def normalise_whatsapp(value: object) -> str | None:
    """A WhatsApp number as digits with the country code (``14734401234``),
    the form ``https://wa.me/<digits>`` needs."""
    text = _blank_to_none(value)
    if text is None:
        return None
    compact = _PHONE_SEPARATORS.sub("", text)
    if compact.startswith("+"):
        compact = compact[1:]
    elif compact.startswith("00"):
        compact = compact[2:]
    if not _WHATSAPP.fullmatch(compact):
        raise ValueError(
            "Enter the WhatsApp number with its country code, for example "
            "+1 473 440 1234"
        )
    return compact


def normalise_instagram(value: object) -> str | None:
    """An Instagram handle without ``@``. A profile address
    (``https://www.instagram.com/<handle>/``) is reduced to its handle."""
    text = _blank_to_none(value)
    if text is None:
        return None
    handle = text
    lowered = text.lower()
    if "instagram.com" in lowered:
        address = text if "://" in text else f"https://{text}"
        parts = urlsplit(address)
        if (parts.hostname or "").lower() not in _INSTAGRAM_HOSTS:
            raise ValueError("Enter an Instagram handle or instagram.com address")
        segments = [segment for segment in parts.path.split("/") if segment]
        if len(segments) != 1:
            raise ValueError("Enter an Instagram handle or instagram.com address")
        handle = segments[0]
    handle = handle.removeprefix("@")
    if not _INSTAGRAM_HANDLE.fullmatch(handle):
        raise ValueError(
            "Enter an Instagram handle: letters, numbers, dots and underscores, "
            "at most 30"
        )
    return handle


def normalise_email(value: object) -> str | None:
    """Blank becomes ``None``; ``EmailStr`` checks the address itself."""
    return _blank_to_none(value)
