import re

# C0/C1 controls except tab and newline, plus Unicode bidi controls (which can
# make a reason read differently from what is stored) and zero-width characters.
_CONTROL = re.compile(
    "[\x01-\x08\x0b-\x1f\x7f-\x9f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]"
)


def clean_reason(value: str | None) -> str | None:
    """A free-text reason: NUL is refused (ValueError, a 422 at the schema seam);
    other control, bidi and zero-width characters are removed; newlines and tabs
    are kept. Measure length only after this runs."""
    if value is None:
        return None
    if "\x00" in value:
        raise ValueError("The reason contains a NUL character")
    return _CONTROL.sub("", value)
