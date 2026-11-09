"""The shared free-text reason cleaner (#994, item 2; used by roster overrides and sign-in setup)."""

import pytest

from src.hr.roster.schemas import RosterPublishRequest
from src.utils.text import clean_reason


def chars(*code_points: int) -> str:
    """Build text from code points so invisible characters stay visible in review."""
    return "".join(chr(code_point) for code_point in code_points)


SOFT_HYPHEN = chars(0x00AD)
GRAPHEME_JOINER = chars(0x034F)
HANGUL_CHOSEONG_FILLER = chars(0x115F)
HANGUL_JUNGSEONG_FILLER = chars(0x1160)
MONGOLIAN_VOWEL_SEPARATOR = chars(0x180E)
HANGUL_FILLER = chars(0x3164)
HALFWIDTH_HANGUL_FILLER = chars(0xFFA0)
VARIATION_SELECTOR_1 = chars(0xFE00)
TEXT_PRESENTATION = chars(0xFE0E)
EMOJI_PRESENTATION = chars(0xFE0F)
COMBINING_KEYCAP = chars(0x20E3)
IDEOGRAPHIC_VARIATION_SELECTOR = chars(0xE0100)
HEART = chars(0x2764)
DIGIT_ONE = "1"


def test_none_stays_none() -> None:
    assert clean_reason(None) is None


def test_control_bidi_and_zero_width_characters_are_removed() -> None:
    text = "Sick" + chars(0x202E) + " cover" + chars(0x200B) + " leave"
    text += chars(0x2066, 0xFEFF, 0x01)
    assert clean_reason(text) == "Sick cover leave"


def test_newlines_and_tabs_are_kept() -> None:
    assert clean_reason("a\tb\nc") == "a\tb\nc"


def test_nul_is_refused() -> None:
    with pytest.raises(ValueError, match="NUL"):
        clean_reason("cover\x00shift")


@pytest.mark.parametrize(
    "invisible",
    [
        SOFT_HYPHEN,
        GRAPHEME_JOINER,
        HANGUL_CHOSEONG_FILLER,
        HANGUL_JUNGSEONG_FILLER,
        MONGOLIAN_VOWEL_SEPARATOR,
        HANGUL_FILLER,
        HALFWIDTH_HANGUL_FILLER,
        VARIATION_SELECTOR_1,
    ],
)
def test_invisible_padding_is_removed(invisible: str) -> None:
    # Padding that renders as nothing must not count toward a length minimum.
    assert clean_reason(invisible * 10) == ""
    assert clean_reason("ab" + invisible + "cd") == "abcd"


def test_ideographic_variation_selectors_are_left_alone() -> None:
    # They choose a specific CJK glyph, so removing them would change the reason.
    assert (
        clean_reason(IDEOGRAPHIC_VARIATION_SELECTOR) == IDEOGRAPHIC_VARIATION_SELECTOR
    )


@pytest.mark.parametrize("selector", [TEXT_PRESENTATION, EMOJI_PRESENTATION])
def test_presentation_selectors_with_no_base_character_are_padding(
    selector: str,
) -> None:
    assert clean_reason(selector * 10) == ""  # no base character: all padding
    assert clean_reason(selector + "cover") == "cover"  # at the start: padding


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (HEART + EMOJI_PRESENTATION + " cover", HEART + EMOJI_PRESENTATION + " cover"),
        (HEART + TEXT_PRESENTATION + " cover", HEART + TEXT_PRESENTATION + " cover"),
        (
            DIGIT_ONE + EMOJI_PRESENTATION + COMBINING_KEYCAP + " cover",
            DIGIT_ONE + EMOJI_PRESENTATION + COMBINING_KEYCAP + " cover",
        ),
        (
            HEART + EMOJI_PRESENTATION * 3 + " cover",
            HEART + EMOJI_PRESENTATION + " cover",
        ),
        ("a" + chars(0x200B) + EMOJI_PRESENTATION, "a" + EMOJI_PRESENTATION),
    ],
)
def test_one_presentation_selector_after_a_character_is_kept(
    text: str, expected: str
) -> None:
    assert clean_reason(text) == expected


def test_normal_text_is_unchanged() -> None:
    text = "Caf" + chars(0x00E9) + " " + chars(0x00F1) + " " + chars(0x1F600)
    assert clean_reason(text) == text
    assert clean_reason("Sick leave, cover needed.") == "Sick leave, cover needed."


def test_whitespace_is_not_trimmed_here() -> None:
    # Trimming is the caller's job; the cleaner keeps whitespace as typed.
    assert clean_reason("   ") == "   "
    assert clean_reason("\t\n") == "\t\n"


def test_roster_override_reason_turns_filler_padding_into_nothing() -> None:
    # Behaviour, not identity: the roster validator is what the API runs.
    request = RosterPublishRequest(rule_override_reason=HANGUL_FILLER * 10)
    assert request.rule_override_reason == ""


def test_roster_override_reason_keeps_emoji_glyphs() -> None:
    reason = HEART + EMOJI_PRESENTATION + " cover"
    request = RosterPublishRequest(rule_override_reason=reason)
    assert request.rule_override_reason == reason
