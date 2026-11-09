"""IWXXM schema fetch contract, and the stored record when the schemas are not installed.

These tests need no XSD, so they run everywhere (the XSD tests are in
test_eregister_iwxxm.py).
"""

import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from scripts import fetch_iwxxm_schemas
from src.eregister import derive, iwxxm

OBSERVED = datetime(2026, 3, 30, 12, 0, tzinfo=UTC)
STATION_78958 = derive.PressureSettings(
    total_correction_hpa=0.0,
    qfe_offset_hpa=0.3,
    sea_level_offset_hpa=1.0,
    qnh_offset_hpa=0.1,
)
BODY: dict[str, Any] = {
    "report_type": "AAXX",
    "day": "30",
    "time_utc": "12",
    "station_id": "78958",
    "wind_indicator": "4",
    "precip_indicator": "1",
    "station_wx_indicator": "1",
    "visibility": "50",
    "total_cloud": "0",
    "wind_dir": "00",
    "wind_speed": "00",
    "air_temp": "254",
    "dew_point": "213",
    "station_pressure": "0153",
    "msl_pressure": "0163",
    "present_wx": "00",
    "source": "eregister-workbook",
}


def encode(**changes: Any) -> dict[str, Any]:
    return iwxxm.record_for_row(
        body={**BODY, **changes},
        station=STATION_78958,
        observed_at=OBSERVED,
        aerodrome_icao="TGPY",
        correction=False,
    )


def test_manifest_pins_every_file_by_sha256_from_the_tag() -> None:
    manifest = json.loads(fetch_iwxxm_schemas.MANIFEST_PATH.read_text(encoding="utf-8"))
    assert manifest["version"] == iwxxm.IWXXM_VERSION
    assert manifest["tag"] == "v2025-2"
    assert (
        manifest["raw_base"]
        == "https://raw.githubusercontent.com/wmo-im/iwxxm/v2025-2/"
    )
    files: dict[str, str] = manifest["files"]
    assert len(files) == 100
    for relative, digest in files.items():
        assert re.fullmatch(r"[0-9a-f]{64}", digest), relative
        assert relative.startswith(("IWXXM/", "externalSchema/")), relative
    assert "IWXXM/iwxxm.xsd" in files
    assert "IWXXM/rule/iwxxm.sch" in files


def test_installed_problems_reports_missing_and_changed_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(fetch_iwxxm_schemas, "DESTINATION", tmp_path)
    (tmp_path / "a.xsd").write_bytes(b"alpha")
    expected = {
        "a.xsd": hashlib.sha256(b"alpha").hexdigest(),
        "b.xsd": hashlib.sha256(b"beta").hexdigest(),
    }
    assert fetch_iwxxm_schemas.installed_problems(expected) == ["missing b.xsd"]
    (tmp_path / "a.xsd").write_bytes(b"changed")
    (tmp_path / "b.xsd").write_bytes(b"beta")
    assert fetch_iwxxm_schemas.installed_problems(expected) == ["changed a.xsd"]
    (tmp_path / "a.xsd").write_bytes(b"alpha")
    assert fetch_iwxxm_schemas.installed_problems(expected) == []


def test_without_schemas_the_document_is_kept_and_its_validity_is_null(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(iwxxm, "schemas_installed", lambda: False)
    stored = encode()
    assert stored["xml"] is not None and "<iwxxm:METAR" in stored["xml"]
    assert stored["valid"] is None
    assert stored["errors"] == []
    assert stored["note"] == iwxxm.SCHEMAS_MISSING_NOTE
    assert "not installed" in stored["note"]


def test_without_schemas_a_known_gap_still_makes_the_record_invalid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(iwxxm, "schemas_installed", lambda: False)
    stored = encode(present_wx="06")
    assert stored["valid"] is False
    assert any("ww 06" in error for error in stored["errors"]), stored["errors"]
    assert stored["note"] == iwxxm.SCHEMAS_MISSING_NOTE
