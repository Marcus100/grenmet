"""The tide import command: dry run and refusal happen before any database work.

The CSV is synthetic: no owner data in git.
"""

from datetime import datetime, timedelta
from pathlib import Path

import pytest

from scripts import import_tide_table

HEADER = (
    "date_ast,event_number,event_type,time_ast,time_utc,"
    "height_m_pric_radar_datum,"
    "height_m_uhslc_station_datum_provisional_crosswalk,"
    "height_m_relative_uhslc_mllw_provisional_crosswalk,"
    "status,timing_quality,minimum_adjacent_excursion_m"
)
STATUS = "PROVISIONAL_INTERNAL_NOT_FOR_NAVIGATION"


def _write(path: Path, times: list[datetime]) -> Path:
    lines = [HEADER]
    for index, time in enumerate(times):
        kind = "LOW" if index % 2 == 0 else "HIGH"
        lines.append(
            f"2027-01-01,{index + 1},{kind},x,{time:%Y-%m-%d %H:%M} UTC,"
            f"1.0,0.5,0.{index % 9 + 1},{STATUS},STANDARD_MODEL_TURNING_POINT,0.1"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def _two_days(start: datetime = datetime(2027, 1, 1, 5, 0)) -> list[datetime]:
    return [start + timedelta(hours=6.2 * index) for index in range(8)]


@pytest.fixture
def no_database(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("the database must not be touched")

    monkeypatch.setattr(import_tide_table, "describe_target", fail)
    monkeypatch.setattr(import_tide_table, "_run", fail)


@pytest.mark.usefixtures("no_database")
def test_dry_run_prints_the_summary_and_writes_nothing(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    csv_path = _write(tmp_path / "pric.csv", _two_days())
    code = import_tide_table.main(
        [
            str(csv_path),
            "--source-version",
            "v1.5",
            "--expect-from",
            "2027-01-01",
            "--expect-to",
            "2027-01-02",
            "--dry-run",
        ]
    )
    out = capsys.readouterr().out
    assert code == 0
    assert "events: 8 (4 high, 4 low, 0 near-flat)" in out
    assert "AST dates: 2027-01-01 to 2027-01-02" in out
    assert "first: LOW  2027-01-01 05:00 UTC (2027-01-01 01:00 AST)" in out
    assert "per month (AST): 2027-01 8" in out
    assert "checks: passed" in out
    assert "dry run: nothing written" in out


@pytest.mark.usefixtures("no_database")
def test_dry_run_fails_when_coverage_is_short(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    csv_path = _write(tmp_path / "pric.csv", _two_days())
    code = import_tide_table.main(
        [str(csv_path), "--expect-to", "2027-12-31", "--dry-run"]
    )
    out = capsys.readouterr().out
    assert code == 1
    assert "error: file ends 2027-01-02, expected 2027-12-31 or later" in out
    assert "checks: FAILED" in out


@pytest.mark.usefixtures("no_database")
def test_import_refuses_a_file_with_a_gap_before_connecting(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    times = [*_two_days(), datetime(2027, 1, 5, 5, 0)]
    csv_path = _write(tmp_path / "pric.csv", times)
    code = import_tide_table.main([str(csv_path), "--source-version", "v1.5"])
    captured = capsys.readouterr()
    assert code == 1
    assert "gap:" in captured.out
    assert "missing AST date: 2027-01-03" in captured.out
    assert "import refused" in captured.err


@pytest.mark.usefixtures("no_database")
def test_unreadable_file_is_reported(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code = import_tide_table.main([str(tmp_path / "missing.csv"), "--dry-run"])
    assert code == 1
    assert "import failed" in capsys.readouterr().err
