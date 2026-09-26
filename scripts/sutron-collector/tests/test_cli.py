from pathlib import Path

import pytest

from sutron_collector.cli import main
from sutron_collector.store import ObservationStore
from sutron_collector.surface_export import UnmappedTagsError


def test_fixture_saves_before_writing_surface_file(tmp_path: Path) -> None:
    capture = tmp_path / "capture.txt"
    capture.write_bytes(b"AT 29.5 G OK\r\nRH 78.1 G OK\r\n")
    archive = tmp_path / "archive" / "observations.db"
    outgoing = tmp_path / "outgoing"

    assert (
        main(
            [
                "fixture",
                str(capture),
                "--format",
                "surface",
                "--store",
                str(archive),
                "--output-dir",
                str(outgoing),
            ]
        )
        == 0
    )

    with ObservationStore(archive) as store:
        rows = store.readings()
    assert {row.tag for row in rows} == {"AT", "RH"}
    assert {str(row.value) for row in rows} == {"29.5", "78.1"}
    assert all(row.status_tokens == ("G", "OK") for row in rows)
    files = list(outgoing.glob("surface_78958_*.csv"))
    assert len(files) == 1
    assert "29.5;78.1" in files[0].read_text(encoding="utf-8")


def test_unmapped_tag_survives_failed_surface_export(tmp_path: Path) -> None:
    capture = tmp_path / "capture.txt"
    capture.write_bytes(b"NEWSENSOR 1.0 G OK\r\n")
    archive = tmp_path / "archive" / "observations.db"
    outgoing = tmp_path / "outgoing"

    with pytest.raises(UnmappedTagsError, match="NEWSENSOR"):
        main(
            [
                "fixture",
                str(capture),
                "--format",
                "surface",
                "--store",
                str(archive),
                "--output-dir",
                str(outgoing),
            ]
        )

    with ObservationStore(archive) as store:
        assert store.readings()[0].tag == "NEWSENSOR"
    assert not outgoing.exists()


def test_replay_restores_handoff_from_archive(tmp_path: Path) -> None:
    capture = tmp_path / "capture.txt"
    capture.write_bytes(b"AT 29.5 G OK\r\n")
    archive = tmp_path / "archive" / "observations.db"
    original = tmp_path / "original"
    main(
        [
            "fixture",
            str(capture),
            "--format",
            "surface",
            "--store",
            str(archive),
            "--output-dir",
            str(original),
        ]
    )
    with ObservationStore(archive) as store:
        collected_at = store.readings()[0].observed_at.isoformat()

    recovered = tmp_path / "recovered"
    assert (
        main(
            [
                "replay",
                "--store",
                str(archive),
                "--collected-at",
                collected_at,
                "--output-dir",
                str(recovered),
            ]
        )
        == 0
    )
    assert (
        next(original.glob("*.csv")).read_bytes()
        == next(recovered.glob("*.csv")).read_bytes()
    )


def test_replay_does_not_create_a_missing_archive(tmp_path: Path) -> None:
    archive = tmp_path / "missing" / "observations.db"
    with pytest.raises(FileNotFoundError, match="archive does not exist"):
        main(
            [
                "replay",
                "--store",
                str(archive),
                "--collected-at",
                "2026-08-15T14:07:03+00:00",
                "--output-dir",
                str(tmp_path / "outgoing"),
            ]
        )
    assert not archive.exists()
