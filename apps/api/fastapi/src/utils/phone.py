"""Phone numbers as people type them, stored in E.164 (``+14734401234``).

Pure functions (no database), shared by the domains that accept a typed phone
number (a business's contact number in bookings, a person's own number in auth).
"""

import re

# Spaces, dots, dashes and brackets people type inside phone numbers.
PHONE_SEPARATORS = re.compile(r"[\s().\-]")
#: E.164: a plus, a country code that does not start with 0, at most 15 digits.
E164 = re.compile(r"^\+[1-9][0-9]{6,14}$")


def blank_to_none(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError("Enter text")
    stripped = value.strip()
    return stripped or None


def normalise_phone(value: object) -> str | None:
    """A phone number in E.164 form (``+14734401234``); ``None`` for a blank entry.

    Raises ``ValueError`` with a message the person can act on (a 422 from a schema).
    """
    text = blank_to_none(value)
    if text is None:
        return None
    compact = PHONE_SEPARATORS.sub("", text)
    if compact.startswith("00"):
        compact = f"+{compact[2:]}"
    if not E164.fullmatch(compact):
        raise ValueError(
            "Enter the phone number with its country code, for example +1 473 440 1234"
        )
    return compact
