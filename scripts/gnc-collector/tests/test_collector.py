import os
from pathlib import Path
from typing import Any

import pytest

from gnc_collector.archive import ArchiveClient, ConfigurationError, Storage
from gnc_collector.collector import (
    MAX_ATTEMPTS,
    STATE_FILE,
    collect,
    discover,
    storage_path,
)
from gnc_collector.goes import CARIBBEAN, parse_name
from gnc_collector.render import BANDS, png_size, render

TOKEN = "t" * 40


class FakeClient(ArchiveClient):
    def __init__(self) -> None:
        super().__init__("http://127.0.0.1:8000/api/v1/wxwatch", TOKEN)
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def post(self, path: str, payload: Any) -> Any:
        self.calls.append((path, dict(payload)))
        return {"id": "11111111-1111-1111-1111-111111111111"} if path == "/runs" else {}


def test_discover_skips_unsettled_regional_and_foreign_files(receiver: Path) -> None:
    scans = discover(receiver, [13, 8])
    names = [s.path.name for s in scans]
    assert len(names) == 4
    assert all("CMIPF" in n and "s2026299122" not in n for n in names)
    assert scans[0].scan_start >= scans[-1].scan_start  # newest first


def test_render_writes_a_png_without_network(tmp_path: Path, receiver: Path) -> None:
    scan = discover(receiver, [13])[0]
    output = tmp_path / "out" / "ir.png"
    width, height = render(
        scan.path, BANDS[13], CARIBBEAN, scan.scan_start, output, coastlines=False
    )
    assert output.exists() and not output.with_suffix(".tmp.png").exists()
    assert (width, height) == png_size(output)
    assert width > 100 and height > 100


def test_collect_archives_each_scan_once_and_registers_metadata(
    tmp_path: Path, receiver: Path
) -> None:
    client = FakeClient()
    work = tmp_path / "work"
    storage = Storage(local_root=tmp_path / "archive")
    result = collect(receiver, work, client, storage, coastlines=False)

    assert result.failed == []
    assert len(result.archived) == 4
    paths = [c[0] for c in client.calls]
    assert paths[0] == "/runs" and paths[-1].endswith("/finish")
    assert client.calls[-1][1] == {"status": "finished"}
    ingested = [body for path, body in client.calls if path == "/ingest"]
    assert len(ingested) == 4
    first = ingested[0]
    assert first["storage_path"].startswith("gnca/goes19-")
    assert first["time_basis"] == "filename"
    assert first["image_url"].startswith("gnca:goes19-")
    assert len(first["checksum"]) == 64
    assert (tmp_path / "archive" / first["storage_path"]).exists()
    assert (work / STATE_FILE).exists()

    # Second pass: nothing new, so no run is opened at all.
    again = FakeClient()
    assert collect(receiver, work, again, storage, coastlines=False).archived == []
    assert again.calls == []


def test_collect_records_a_bad_file_and_keeps_going(
    tmp_path: Path, receiver: Path
) -> None:
    broken = next(receiver.glob("*C13*s20262991210*"))
    broken.write_bytes(b"truncated")

    os.utime(broken, (0, 0))
    client = FakeClient()
    result = collect(
        receiver,
        tmp_path / "work",
        client,
        Storage(local_root=tmp_path / "a"),
        coastlines=False,
    )
    assert len(result.failed) == 1 and broken.name in result.failed[0]
    assert len(result.archived) == 3
    assert client.calls[-1][1] == {"status": "failed"}
    # The broken file is retried next time rather than silently forgotten.
    assert discover(receiver, [13, 8])


def test_max_files_bounds_one_pass(tmp_path: Path, receiver: Path) -> None:
    result = collect(
        receiver,
        tmp_path / "w",
        None,
        Storage(local_root=tmp_path / "a"),
        max_files=1,
        coastlines=False,
    )
    assert len(result.archived) == 1


def test_storage_path_is_under_the_source_prefix() -> None:
    scan = parse_name(
        Path(
            "OR_ABI-L2-CMIPF-M6C08_G19_s20262991200212_e20262991209532_c20262991210011.nc"
        )
    )
    assert scan is not None
    assert storage_path(scan, "wv", CARIBBEAN) == (
        "gnca/goes19-wv-caribbean/2026/10/26/goes19_wv_caribbean_20261026T1200Z.png"
    )


@pytest.mark.parametrize(
    ("url", "token"),
    [
        ("ftp://host/api", TOKEN),
        ("http://api.example.org/api", TOKEN),
        ("https://user:pw@host/api", TOKEN),
        ("https://host/api", "short"),
    ],
)
def test_client_rejects_unsafe_settings(url: str, token: str) -> None:
    with pytest.raises(ConfigurationError):
        ArchiveClient(url, token)


def test_partial_object_storage_settings_are_refused(tmp_path: Path) -> None:
    with pytest.raises(ConfigurationError, match="STORAGE_BUCKET"):
        Storage.from_env({"STORAGE_ENDPOINT_URL": "https://x"}, tmp_path)
    assert Storage.from_env({}, tmp_path).local_root == tmp_path


def test_loopback_http_is_allowed_for_local_development() -> None:
    ArchiveClient("http://127.0.0.1:8000/api/v1/wxwatch", TOKEN)
    ArchiveClient("https://api.example.org/api/v1/wxwatch", TOKEN)


def test_object_storage_endpoint_must_use_https(tmp_path: Path) -> None:
    settings = {
        "STORAGE_ENDPOINT_URL": "http://spaces.example.org",
        "STORAGE_BUCKET": "b",
        "STORAGE_ACCESS_KEY_ID": "k",
        "STORAGE_SECRET_ACCESS_KEY": "s",
    }
    with pytest.raises(ConfigurationError, match="HTTPS"):
        Storage.from_env(settings, tmp_path)


def test_symlinks_in_the_receiver_folder_are_ignored(
    tmp_path: Path, receiver: Path
) -> None:
    target = next(receiver.glob("*C13*s20262991200*"))
    link = receiver / "elsewhere" / target.name.replace("s2026299120", "s2026299100")
    link.parent.mkdir()
    link.symlink_to(target)
    names = [s.path.name for s in discover(receiver, [13])]
    assert link.name not in names


def test_a_corrupt_state_file_is_set_aside(tmp_path: Path, receiver: Path) -> None:
    work = tmp_path / "work"
    work.mkdir()
    (work / STATE_FILE).write_text("{not json")
    result = collect(
        receiver, work, None, Storage(local_root=tmp_path / "a"), coastlines=False
    )
    assert len(result.archived) == 4
    assert (work / "processed.corrupt").exists()


def test_a_permanently_broken_file_is_given_up_after_max_attempts(
    tmp_path: Path, receiver: Path
) -> None:
    broken = next(receiver.glob("*C13*s20262991210*"))
    broken.write_bytes(b"truncated")
    os.utime(broken, (0, 0))
    work, archive = tmp_path / "work", Storage(local_root=tmp_path / "a")
    for _ in range(MAX_ATTEMPTS):
        result = collect(receiver, work, None, archive, coastlines=False)
        assert any(broken.name in f for f in result.failed)
    final = collect(receiver, work, None, archive, coastlines=False)
    assert final.failed == [] and final.archived == []


def test_a_failed_finish_is_reported_not_raised(tmp_path: Path, receiver: Path) -> None:
    class ExpiredLease(FakeClient):
        def finish_run(self, run_id: str, status: str) -> None:
            raise RuntimeError("Archive API returned HTTP 409 for /runs/x/finish")

    result = collect(
        receiver,
        tmp_path / "w",
        ExpiredLease(),
        Storage(local_root=tmp_path / "a"),
        coastlines=False,
    )
    assert len(result.archived) == 4
    assert result.failed == [
        "finishing run: Archive API returned HTTP 409 for /runs/x/finish"
    ]
