from pathlib import Path

import pytest

from gnc_collector.cli import main


def test_dry_run_renders_without_api_or_credentials(
    tmp_path: Path,
    receiver: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.delenv("WXWATCH_INGEST_TOKEN", raising=False)
    code = main(
        [
            "collect",
            "--input-dir",
            str(receiver),
            "--work-dir",
            str(tmp_path / "w"),
            "--bands",
            "13",
            "--dry-run",
            "--no-coastlines",
        ]
    )
    assert code == 0
    assert capsys.readouterr().out.count("archived gnca/") == 2
    assert list((tmp_path / "w" / "images" / "gnca").rglob("*.png"))


def test_collect_without_token_fails_closed(
    tmp_path: Path, receiver: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("WXWATCH_INGEST_TOKEN", raising=False)
    assert (
        main(["collect", "--input-dir", str(receiver), "--work-dir", str(tmp_path)])
        == 2
    )


def test_missing_input_folder_is_an_error(tmp_path: Path) -> None:
    assert (
        main(
            [
                "collect",
                "--input-dir",
                str(tmp_path / "nope"),
                "--work-dir",
                str(tmp_path),
                "--dry-run",
            ]
        )
        == 2
    )


def test_unsupported_band_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(SystemExit):
        main(
            [
                "collect",
                "--input-dir",
                str(tmp_path),
                "--work-dir",
                str(tmp_path),
                "--bands",
                "2",
            ]
        )


def test_render_command(tmp_path: Path, receiver: Path) -> None:
    source = next(receiver.glob("*CMIPF*C08*s20262991200*"))
    output = tmp_path / "wv.png"
    assert (
        main(["render", str(source), "--output", str(output), "--no-coastlines"]) == 0
    )
    assert output.exists()


def test_dry_run_never_marks_files_done_for_the_real_run(
    tmp_path: Path, receiver: Path
) -> None:
    work = tmp_path / "w"
    args = ["collect", "--input-dir", str(receiver), "--work-dir", str(work)]
    assert main([*args, "--dry-run", "--no-coastlines"]) == 0
    assert (work / "processed-dry-run.json").exists()
    assert not (work / "processed.json").exists()


def test_check_passes_when_files_are_recent_and_fails_when_stale(
    receiver: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    args = ["check", "--input-dir", str(receiver)]
    assert main([*args, "--max-age-minutes", "30"]) == 0
    assert "STALE" not in capsys.readouterr().out
    assert main([*args, "--bands", "8", "--max-age-minutes", "1"]) == 1
    assert "band 8: STALE" in capsys.readouterr().out


def test_check_fails_when_a_band_has_no_files(tmp_path: Path) -> None:
    assert main(["check", "--input-dir", str(tmp_path), "--bands", "13"]) == 1
