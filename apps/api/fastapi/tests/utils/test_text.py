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
