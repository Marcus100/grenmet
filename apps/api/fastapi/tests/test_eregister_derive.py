"""Values the register calculates: visibility code from km, humidity from wet bulb."""

from decimal import Decimal

import pytest

from src.eregister import derive, rules
from src.eregister.schemas import SynopWorkbook

from .test_eregister_validation import PAPER_ROW


@pytest.mark.parametrize(
    ("km", "code"),
    [
        ("0", "00"),
        ("0.05", "00"),
        ("0.1", "01"),
        ("0.8", "08"),
        ("4.9", "49"),
        ("5", "50"),
        ("5.9", "50"),  # 51 to 55 are unused: round down
        ("6", "56"),
        ("18", "68"),
        ("18.9", "68"),
        ("30", "80"),
        ("34.9", "80"),
        ("35", "81"),
        ("39.9", "81"),
        ("70", "88"),
        ("70.1", "89"),
        ("99", "89"),
    ],
)
def test_visibility_km_gives_the_code_table_4377_group(km: str, code: str) -> None:
    assert derive.visibility_code_from_km(Decimal(km)) == code


@pytest.mark.parametrize("text", ["", "  ", "abc", "-1", "1,5", "NaN", "Infinity"])
def test_unusable_visibility_text_is_not_a_number_of_km(text: str) -> None:
    assert derive.parse_visibility_km(text) is None


def test_visibility_in_km_replaces_the_keyed_code() -> None:
    row = {**PAPER_ROW, "visibility": "10", "visibility_km": "18"}
    workbook = derive.apply_to_workbook(SynopWorkbook.model_validate(row))
    assert workbook.visibility == "68"
    _issues, decoded = rules.validate_synop(SynopWorkbook.model_validate(row))
    assert decoded.visibility_m == 18000


def test_a_bad_visibility_in_km_is_an_error() -> None:
    row = {**PAPER_ROW, "visibility_km": "far"}
    issues, _ = rules.validate_synop(SynopWorkbook.model_validate(row))
    assert [
        (i.field, i.code, i.severity) for i in issues if i.field == "visibility_km"
    ] == [("visibility_km", "invalid_km", "error")]


def test_humidity_is_calculated_from_dry_bulb_wet_bulb_and_station_pressure() -> None:
    # Dry 28.0, wet 24.0, station pressure 1015.3 hPa.
    result = derive.humidity_from_workbook(
        {"air_temp": "280", "wet_bulb": "240", "station_pressure": "0153"}
    )
    assert result is not None
    dew, vapour, percent = result
    assert dew == pytest.approx(22.4, abs=0.1)
    assert vapour == pytest.approx(27.0, abs=0.1)
    assert percent == 72


def test_dry_and_wet_bulb_equal_means_saturated_air() -> None:
    result = derive.humidity_from_workbook(
        {"air_temp": "250", "wet_bulb": "250", "station_pressure": "0100"}
    )
    assert result is not None
    dew, _vapour, percent = result
    assert dew == pytest.approx(25.0, abs=0.01)
    assert percent == 100


def test_humidity_needs_every_source() -> None:
    base = {"air_temp": "280", "wet_bulb": "240", "station_pressure": "0153"}
    for missing in base:
        assert derive.humidity_from_workbook({**base, missing: ""}) is None
    # A wet bulb above the dry bulb cannot be a psychrometer reading.
    assert derive.humidity_from_workbook({**base, "wet_bulb": "300"}) is None


def test_negative_temperatures_keep_their_sign_digit() -> None:
    assert derive.temperature_group(-3.4) == "1034"
    assert derive.temperature_group(22.4) == "0224"
    assert derive.temperature_group(-0.04) == "0000"  # never negative zero


def test_dew_point_humidity_replace_the_keyed_values_when_wet_bulb_is_given() -> None:
    row = {**PAPER_ROW, "wet_bulb": "240", "dew_point": "100", "relative_humidity": "5"}
    workbook = derive.apply_to_workbook(SynopWorkbook.model_validate(row))
    assert workbook.dew_point == "0224"
    assert workbook.relative_humidity == "72"
    issues, decoded = rules.validate_synop(SynopWorkbook.model_validate(row))
    assert not [i for i in issues if i.severity == "error"]
    assert decoded.dew_point_k == 295.55
    assert decoded.relative_humidity_percent == 72


def test_without_a_wet_bulb_the_keyed_dew_point_stays() -> None:
    workbook = derive.apply_to_workbook(SynopWorkbook.model_validate(PAPER_ROW))
    assert workbook.dew_point == PAPER_ROW["dew_point"]
    assert workbook.relative_humidity is None


def test_the_stored_body_gets_the_calculated_fields_flat_or_nested() -> None:
    values = {"air_temp": "280", "wet_bulb": "240", "station_pressure": "0153"}
    flat = derive.apply_to_body({**values, "visibility_km": "6"})
    assert (flat["dew_point"], flat["relative_humidity"], flat["visibility"]) == (
        "0224",
        "72",
        "56",
    )
    nested = derive.apply_to_body({"workbook": values, "source": "x"})
    assert nested["workbook"]["dew_point"] == "0224"
    assert nested["source"] == "x"
    unchanged = {"air_temp": "280"}
    assert derive.apply_to_body(unchanged) is unchanged
