"""Sign-in setup reason cleaning at the schema seam (#994, item 2)."""

import pytest
from pydantic import ValidationError

from src.auth.onboarding_schemas import SignInSetupIssue


def test_zero_width_and_bidi_characters_are_removed_before_length_rules() -> None:
    issue = SignInSetupIssue(
        identity_confirmed=True,
        reason="\u200bSick\u202e cover\u2066 leave\ufeff\u200d",
    )
    assert issue.reason == "Sick cover leave"


def test_characters_that_clean_to_nothing_fail_the_minimum() -> None:
    # Three zero-width characters look like a reason but measure zero after cleaning.
    with pytest.raises(ValidationError):
        SignInSetupIssue(identity_confirmed=True, reason="\u200b\u200b\u200b")


def test_a_short_reason_padded_with_zero_width_characters_stays_short() -> None:
    with pytest.raises(ValidationError):
        SignInSetupIssue(identity_confirmed=True, reason="ab\u200b\u200b\u202e")


def test_a_nul_character_is_refused() -> None:
    with pytest.raises(ValidationError):
        SignInSetupIssue(identity_confirmed=True, reason="ten chars\x00 here")


def test_tabs_and_newlines_are_kept_and_whitespace_is_stripped() -> None:
    issue = SignInSetupIssue(identity_confirmed=True, reason="  line one\n\tline two  ")
    assert issue.reason == "line one\n\tline two"


def test_no_reason_is_still_allowed() -> None:
    assert SignInSetupIssue(identity_confirmed=True).reason is None
