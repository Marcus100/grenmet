"""The shared free-text reason cleaner (#994, item 2; used by roster overrides and sign-in setup)."""

import pytest

from src.utils.text import clean_reason


def test_none_stays_none() -> None:
    assert clean_reason(None) is None


def test_control_bidi_and_zero_width_characters_are_removed() -> None:
    assert (
        clean_reason("Sick\u202e cover\u200b leave\u2066\ufeff\x01")
        == "Sick cover leave"
    )


def test_newlines_and_tabs_are_kept() -> None:
    assert clean_reason("a\tb\nc") == "a\tb\nc"


def test_nul_is_refused() -> None:
    with pytest.raises(ValueError, match="NUL"):
        clean_reason("cover\x00shift")


@pytest.mark.parametrize(
    "invisible",
    [
        "­",  # soft hyphen
        "͏",  # combining grapheme joiner
        "ᅟ",  # hangul choseong filler
        "ᅠ",  # hangul jungseong filler
        "᠎",  # mongolian vowel separator
        "ㅤ",  # hangul filler (U+3164)
        "ﾠ",  # halfwidth hangul filler
        "️",  # variation selector-16
        "\U000e0100",  # variation selector supplement
    ],
)
def test_invisible_padding_is_removed(invisible: str) -> None:
    # Padding that renders as nothing must not count toward a length minimum.
    assert clean_reason(f"{invisible * 10}") == ""
    assert clean_reason(f"ab{invisible}cd") == "abcd"


def test_roster_reason_uses_the_shared_cleaner() -> None:
    from src.hr.roster import schemas as roster_schemas

    assert roster_schemas.clean_reason is clean_reason
