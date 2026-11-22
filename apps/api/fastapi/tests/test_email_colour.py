"""Brand colour rules for customer email (issue #1622).

The table below is also in ``packages/email-templates/src/components/colour.test.ts``:
both languages must give the same accent for every row.
"""

import pytest

from src import email_colour as colour
from src import email_layout as layout

#: (accent as stored, the accent the mail prints). Navy is the fallback.
ACCENT_CASES = [
    ("#0b63ee", "#0b63ee"),
    ("#0B63EE", "#0b63ee"),
    ("#2563eb", "#2563eb"),
    ("#0b132b", "#0b132b"),
    # 4.54:1 against white: passes. 4.48:1: fails, so navy.
    ("#767676", "#767676"),
    ("#777777", "#0b132b"),
    ("#ff0000", "#0b132b"),
    ("#ffff00", "#0b132b"),
    ("#ffc0cb", "#0b132b"),
    ("#fff", "#0b132b"),
    ("#0b63ee00", "#0b132b"),
    (" #0b63ee", "#0b132b"),
    ("red", "#0b132b"),
    ("url(javascript:1)", "#0b132b"),
    ("", "#0b132b"),
    (None, "#0b132b"),
]


@pytest.mark.parametrize(("stored", "printed"), ACCENT_CASES)
def test_safe_accent_matches_the_react_template(
    stored: str | None, printed: str
) -> None:
    assert colour.safe_accent(stored) == printed


def test_contrast_is_relative_luminance_against_white() -> None:
    assert colour.contrast_with_white("#767676") >= colour.MIN_CONTRAST
    assert colour.contrast_with_white("#777777") < colour.MIN_CONTRAST
    assert colour.contrast_with_white("#000000") == pytest.approx(21.0)


@pytest.mark.parametrize(
    ("raw", "stored"),
    [
        ("#0B63EE", "#0b63ee"),
        ("  #2563eb  ", "#2563eb"),
        ("", None),
        ("   ", None),
        (None, None),
    ],
)
def test_normalise_hex_stores_lower_case_or_clears(
    raw: str | None, stored: str | None
) -> None:
    assert colour.normalise_hex(raw) == stored


@pytest.mark.parametrize("raw", ["red", "#fff", "#0b63ee00", "0b63ee", "#gggggg", 7])
def test_normalise_hex_refuses_anything_else(raw: object) -> None:
    with pytest.raises(ValueError):
        colour.normalise_hex(raw)


def test_the_layout_uses_the_shared_rule() -> None:
    card = layout.EmailCard(title="Hello", accent="#ffff00")
    html = layout.render_html(card)
    assert layout.NAVY in html
    assert "#ffff00" not in html
