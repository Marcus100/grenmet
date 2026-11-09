import re

# Code point ranges (inclusive) removed from free-text reasons. The first group is
# C0/C1 controls except tab and newline; then Unicode bidi controls (which can make
# a reason read differently from what is stored), zero-width characters, and
# invisible padding that could otherwise pad a length minimum: soft hyphen,
# combining grapheme joiner, hangul and halfwidth fillers, Mongolian vowel
# separator, and variation selectors U+FE00-FE0D (never used by emoji).
# U+FE0E and U+FE0F are handled in clean_reason, because they select text or
# emoji presentation for the character before them. U+E0100-E01EF (ideographic
# variation selectors) are deliberately left alone: they pick a specific CJK
# glyph, so removing them would change the reason's meaning, and they are not
# used as padding.
_REMOVED_RANGES = (
    (0x01, 0x08),
    (0x0B, 0x1F),
    (0x7F, 0x9F),
    (0x00AD, 0x00AD),
    (0x034F, 0x034F),
    (0x061C, 0x061C),
    (0x115F, 0x1160),
    (0x180E, 0x180E),
    (0x200B, 0x200F),
    (0x202A, 0x202E),
    (0x2060, 0x2069),
    (0x3164, 0x3164),
    (0xFE00, 0xFE0D),
    (0xFEFF, 0xFEFF),
    (0xFFA0, 0xFFA0),
)
_CONTROL = re.compile(
    "["
    + "".join(
        chr(low) if low == high else f"{chr(low)}-{chr(high)}"
        for low, high in _REMOVED_RANGES
    )
    + "]"
)

_PRESENTATION = frozenset({chr(0xFE0E), chr(0xFE0F)})


def clean_reason(value: str | None) -> str | None:
    """A free-text reason: NUL is refused (ValueError, a 422 at the schema seam);
    control, bidi, zero-width and invisible padding characters are removed; newlines
    and tabs are kept. U+FE0E and U+FE0F (text and emoji presentation) are kept
    only when they follow a character, so a heart with its emoji selector or a
    keycap sequence keeps its glyph, while a run of them or one at the start counts
    as padding. Whitespace is not trimmed here. Measure length only after this
    runs."""
    if value is None:
        return None
    if "\x00" in value:
        raise ValueError("The reason contains a NUL character")
    kept: list[str] = []
    for char in _CONTROL.sub("", value):
        if char in _PRESENTATION:
            # Keep one selector directly after a base character; drop any other.
            if kept and kept[-1] not in _PRESENTATION:
                kept.append(char)
            continue
        kept.append(char)
    return "".join(kept)
