import pytest

from tests.quarantine import (
    MAX_ENTRIES,
    QUARANTINE_FILE,
    load_quarantine,
    parse_quarantine,
    quarantine_key,
)

pytestmark = pytest.mark.unit


def test_parses_entries_and_reports_bad_lines() -> None:
    entries, bad = parse_quarantine(
        "# comment\n"
        "\n"
        "tests/hr/test_a.py::test_one #12\n"
        "tests/test_b.py::TestX::test_two   #345\n"
        "tests/test_c.py::test_no_issue\n"
        "src/thing.py::test_wrong_place #9\n"
    )
    assert entries == {
        "tests/hr/test_a.py::test_one": 12,
        "tests/test_b.py::TestX::test_two": 345,
    }
    assert bad == [
        "tests/test_c.py::test_no_issue",
        "src/thing.py::test_wrong_place #9",
    ]


def test_key_drops_the_parametrisation_suffix() -> None:
    assert quarantine_key("tests/a.py::test_x[case-1]") == "tests/a.py::test_x"
    assert quarantine_key("tests/a.py::test_x") == "tests/a.py::test_x"


def test_a_missing_file_means_nothing_is_quarantined(tmp_path) -> None:
    assert load_quarantine(tmp_path / "absent.txt") == {}


def test_the_committed_list_is_valid_and_short() -> None:
    entries, bad = parse_quarantine(QUARANTINE_FILE.read_text())
    assert bad == [], "each line needs a tests/...::test node and an issue: #123"
    assert len(entries) <= MAX_ENTRIES, "fix quarantined tests before adding more"
