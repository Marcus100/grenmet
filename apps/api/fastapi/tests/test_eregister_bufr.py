"""BUFR (Surface-RA-IV-100) for accepted SYNOP observations: round trip and checks.

Each golden SYNOP is converted with csv2bufr, decoded again with ecCodes and compared
with the observation's decoded SI values. A deliberately broken value must fail the
check, and the stored record must block sends (see test_eregister_send.py).
"""

import base64
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from src.eregister import bufr, derive, encode, rules

OBSERVED = datetime(2026, 3, 30, 12, 0, tzinfo=UTC)
# Owner-confirmed 78958 pressure amounts (eregister AGENTS: QFE +0.3, sea level +1.0, QNH +0.1).
STATION_78958 = derive.PressureSettings(
    total_correction_hpa=0.0,
    qfe_offset_hpa=0.3,
    sea_level_offset_hpa=1.0,
    qnh_offset_hpa=0.1,
)
# A dry, calm hour: 25.4 C air, 21.3 C dew point, MSL 1016.3 hPa, 5 km.
CALM = {
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
GOLDEN: dict[str, dict[str, Any]] = {
    "calm_clear": CALM,
    "gusty_rain": {
        **CALM,
        "wind_dir": "24",
        "wind_speed": "15",
        "wind_gust": "25",
        "present_wx": "63",
        "visibility": "40",
        "precip_amount": "012",
        "precip_period": "1",
        "total_cloud": "6",
        "s3_layer1_amount": "6",
        "s3_layer1_form": "9",
        "s3_layer1_height": "10",
        "air_temp": "228",
        "dew_point": "198",
    },
    "haze_no_cloud": {
        **CALM,
        "present_wx": "05",
        "visibility": "50",
        "air_temp": "271",
    },
    "variable_wind": {**CALM, "wind_dir": "99", "wind_speed": "04", "present_wx": "51"},
}


def workbook_and_decoded(body: dict[str, Any]) -> tuple[Any, Any]:
    workbook = encode.workbook_from_body(body)
    _issues, decoded = rules.validate_synop(
        workbook, STATION_78958, None, recompute=False
    )
    return workbook, decoded


def convert(body: dict[str, Any]) -> tuple[bytes, dict[str, Any]]:
    workbook, decoded = workbook_and_decoded(body)
    row = encode.wis2_row(workbook, decoded, OBSERVED, bufr.wis2box_settings)
    message = bufr.to_bufr(encode.wis2_csv(row))
    return message, bufr.decode(message)


@pytest.mark.parametrize("name", sorted(GOLDEN))
def test_golden_synop_round_trips_through_bufr(name: str) -> None:
    record = bufr.record_for_row(
        body=GOLDEN[name], station=STATION_78958, observed_at=OBSERVED
    )
    assert record["template"] == "Surface-RA-IV-100"
    assert record["valid"] is True, record["errors"]
    assert record["errors"] == []
    message = base64.b64decode(record["base64"])
    assert message[:4] == b"BUFR"
    checks = {check["name"]: check for check in record["checks"]}
    assert checks["air_temperature_k"]["ok"] is True
    assert checks["station_pressure_pa"]["ok"] is True
    assert checks["msl_pressure_pa"]["ok"] is True
    assert all(check["ok"] for check in record["checks"])


def test_round_trip_reads_back_the_observation_values() -> None:
    _message, values = convert(GOLDEN["calm_clear"])
    assert values["edition"] == 4
    assert values["subsets"] == 1
    assert (values["wigosIdentifierSeries"], values["wigosIssuerOfIdentifier"]) == (
        0,
        20000,
    )
    assert values["wigosLocalIdentifierCharacter"] == "78958"
    assert (values["year"], values["month"], values["day"]) == (2026, 3, 30)
    assert (values["hour"], values["minute"]) == (12, 0)
    assert values["airTemperature"] == pytest.approx(298.55, abs=0.05)
    assert values["dewpointTemperature"] == pytest.approx(294.45, abs=0.05)
    assert values["windSpeed"] == pytest.approx(0.0, abs=0.05)


def test_present_weather_and_cloud_are_read_back_when_reported() -> None:
    _message, values = convert(GOLDEN["gusty_rain"])
    assert values["presentWeather"] == 63
    assert values["cloudCoverTotal"] == 75  # 6 oktas
    assert values["windDirection"] == pytest.approx(240, abs=1)


def test_a_deliberately_broken_value_fails_its_check() -> None:
    workbook, decoded = workbook_and_decoded(GOLDEN["calm_clear"])
    _message, values = convert(GOLDEN["calm_clear"])
    values["airTemperature"] = values["airTemperature"] + 5.0  # five kelvin out
    checks = bufr.compare(
        workbook=workbook,
        decoded=decoded,
        observed_at=OBSERVED,
        config=bufr.wis2box_settings,
        values=values,
        descriptors=bufr.template_descriptors(),
    )
    failed = {check.name for check in checks if not check.ok}
    assert failed == {"air_temperature_k"}


def test_a_missing_reported_element_fails_its_check() -> None:
    workbook, decoded = workbook_and_decoded(GOLDEN["gusty_rain"])
    _message, values = convert(GOLDEN["gusty_rain"])
    values["presentWeather"] = None
    checks = bufr.compare(
        workbook=workbook,
        decoded=decoded,
        observed_at=OBSERVED,
        config=bufr.wis2box_settings,
        values=values,
        descriptors=bufr.template_descriptors(),
    )
    assert [check.name for check in checks if not check.ok] == ["present_weather_ww"]


def test_a_failed_conversion_yields_an_invalid_record_not_an_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def refuse(_csv_text: str) -> bytes:
        raise bufr.ConversionError("csv2bufr could not convert the row: forced")

    monkeypatch.setattr(bufr, "to_bufr", refuse)
    record = bufr.record_for_row(body=CALM, station=STATION_78958, observed_at=OBSERVED)
    assert record["valid"] is False
    assert record["base64"] is None
    assert record["checks"] == []
    assert record["errors"] == ["csv2bufr could not convert the row: forced"]


def test_the_template_declares_its_descriptors() -> None:
    descriptors = bufr.template_descriptors()
    assert descriptors[:2] == (301150, 307084)


def test_the_packaged_template_is_the_wis2box_template() -> None:
    # tests/ -> fastapi -> api -> apps -> repository root
    repo_copy = (
        Path(__file__).resolve().parents[4]
        / "scripts"
        / "wis2-setup"
        / "Surface-RA-IV-100.json"
    )
    assert bufr.TEMPLATE_PATH.read_bytes() == repo_copy.read_bytes()


# --- reviewer override binding (pure: the override never changes the record) ---


def _record(**changes: object) -> dict[str, Any]:
    base: dict[str, Any] = {
        "template": "Surface-RA-IV-100",
        "base64": "QUJD",
        "checks": [{"name": "air_temperature_k", "ok": False}],
        "valid": False,
        "errors": ["air_temperature_k: observation 298.55, BUFR 303.55"],
    }
    return {**base, **changes}


def _override(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "by": "reviewer",
        "by_name": "Ann Reviewer",
        "at": "2026-11-09T10:00:00+00:00",
        "reason": "Checked against the paper register",
        "record_sha256": bufr.record_digest(record),
    }


def test_digest_ignores_the_override_and_follows_the_record() -> None:
    record = _record()
    assert bufr.record_digest(record) == bufr.record_digest(
        bufr.with_override(record, _override(record))
    )
    changed = _record(base64="QUJE")
    assert bufr.record_digest(record) != bufr.record_digest(changed)


def test_override_applies_only_to_the_record_it_was_given_for() -> None:
    record = _record()
    stamped = bufr.with_override(record, _override(record))
    assert bufr.override_for(stamped) is not None
    # Re-encoded to a different message: the same override no longer applies.
    reencoded = {**stamped, "base64": "QUJE"}
    assert bufr.override_for(reencoded) is None


def test_override_leaves_bytes_and_validity_unchanged() -> None:
    record = _record()
    stamped = bufr.with_override(record, _override(record))
    assert {k: v for k, v in stamped.items() if k != bufr.OVERRIDE_KEY} == record
    assert stamped["valid"] is False


def test_carry_over_keeps_the_override_only_when_the_encoding_is_identical() -> None:
    record = _record(base64=None, errors=["encoder failed"])
    stamped = bufr.with_override(record, _override(record))
    assert bufr.carry_over(stamped, dict(record)) == stamped
    fresh = _record(base64=None, errors=["encoder failed differently"])
    assert bufr.OVERRIDE_KEY not in bufr.carry_over(stamped, fresh)


def test_an_override_without_a_digest_or_of_the_wrong_type_is_ignored() -> None:
    record = _record()
    assert bufr.override_for({**record, bufr.OVERRIDE_KEY: "yes"}) is None
    assert bufr.override_for({**record, bufr.OVERRIDE_KEY: {"reason": "x"}}) is None
