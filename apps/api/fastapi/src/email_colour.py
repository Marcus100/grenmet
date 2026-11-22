"""Brand colour rules for customer email (one rule, two languages).

The same decisions are made in ``packages/email-templates/src/components/colour.ts``.
``tests/test_email_colour.py`` and ``components/colour.test.ts`` check the same table,
so the two cannot drift apart silently.

A brand colour is stored as six-digit hex. It is used as the email accent only when it
reaches 4.5:1 against white (the text on the buttons and chips); otherwise the Barrels
navy is used instead.
"""

import re

NAVY = "#0b132b"
MIN_CONTRAST = 4.5
_HEX = re.compile(r"#[0-9a-fA-F]{6}")


def normalise_hex(value: object) -> str | None:
    """A stored brand colour: ``#rrggbb`` in lower case, or None for a blank value.

    Raises ``ValueError`` for anything that is not six-digit hex (the API answers 422).
    """
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("Use a colour such as #0b63ee")
    text = value.strip()
    if not text:
        return None
    if not _HEX.fullmatch(text):
        raise ValueError("Use a six-digit hex colour such as #0b63ee")
    return text.lower()


def _luminance(colour: str) -> float:
    def channel(index: int) -> float:
        value = int(colour[index : index + 2], 16) / 255
        if value <= 0.03928:
            return value / 12.92
        return float(((value + 0.055) / 1.055) ** 2.4)

    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)


def contrast_with_white(colour: str) -> float:
    return 1.05 / (_luminance(colour) + 0.05)


def safe_accent(value: str | None) -> str:
    """The accent to print: a six-digit hex that clears 4.5:1 against white, else navy."""
    if value and _HEX.fullmatch(value) and contrast_with_white(value) >= MIN_CONTRAST:
        return value.lower()
    return NAVY
