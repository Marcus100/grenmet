"""Organisation decision reasons use the shared free-text cleaner (#1161)."""

import pytest

from src.exceptions import AppException
from src.organisations.service import _clean_reason
from src.utils.text import clean_reason

RIGHT_TO_LEFT_OVERRIDE = "‮"
ZERO_WIDTH_SPACE = "​"
SOFT_HYPHEN = "­"
BELL = "\x07"


def test_strips_the_same_characters_as_the_shared_cleaner() -> None:
    raw = f"{ZERO_WIDTH_SPACE}Approved{RIGHT_TO_LEFT_OVERRIDE} after{SOFT_HYPHEN}{BELL} review  "
    assert _clean_reason(raw) == clean_reason(raw).strip() == "Approved after review"


def test_trims_surrounding_whitespace() -> None:
    assert _clean_reason("  Checked the register  ") == "Checked the register"


def test_keeps_inner_newlines_and_tabs() -> None:
    assert _clean_reason("line one\n\tline two") == "line one\n\tline two"


@pytest.mark.parametrize(
    "raw",
    ["", "   ", f"{ZERO_WIDTH_SPACE}{SOFT_HYPHEN}", f"\t{BELL}\n"],
)
def test_padding_only_reason_is_refused(raw: str) -> None:
    with pytest.raises(AppException) as excinfo:
        _clean_reason(raw)
    assert excinfo.value.status_code == 422
