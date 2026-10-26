"""Values the register calculates: visibility code from km, humidity from wet bulb."""

from decimal import Decimal

import pytest

from src.eregister import derive, rules
from src.eregister.derive import PressureSettings
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


# Owner confirmed for 78958 (2026-10-24).
STATION_78958 = PressureSettings(
    total_correction_hpa=0.0,
    qfe_offset_hpa=0.3,
    sea_level_offset_hpa=1.0,
    qnh_offset_hpa=0.1,
)


def test_the_owner_example_barometer_1012_8() -> None:
    found = derive.pressures({"barometer_reading": "1012.8"}, STATION_78958)
    assert found.station_hpa == Decimal("1012.8")
    assert found.qfe_hpa == Decimal("1013.1")
    assert found.sea_level_hpa == Decimal("1013.8")
    assert found.qnh_hpa == Decimal("1013.9")
    assert derive.pressure_fields({"barometer_reading": "1012.8"}, STATION_78958) == {
        "station_pressure": "0128",
        "msl_pressure": "0138",
    }


def test_the_excel_register_sea_level_rule_group_3_0157_gives_group_4_0167() -> None:
    assert derive.pressure_fields({"station_pressure": "0157"}, STATION_78958) == {
        "msl_pressure": "0167"
    }


@pytest.mark.parametrize(
    ("reading", "station", "sea"),
    [("998.5", "9985", "9995"), ("999.5", "9995", "0005"), ("1000.0", "0000", "0010")],
)
def test_groups_drop_the_thousands_across_1000_hpa(
    reading: str, station: str, sea: str
) -> None:
    assert derive.pressure_fields({"barometer_reading": reading}, STATION_78958) == {
        "station_pressure": station,
        "msl_pressure": sea,
    }


def test_keyed_groups_are_kept_and_a_different_one_warns() -> None:
    values = {
        "barometer_reading": "1012.8",
        "station_pressure": "0130",
        "msl_pressure": "0150",
    }
    assert derive.pressure_fields(values, STATION_78958) == {}
    assert [
        code for _f, code, _m in derive.pressure_mismatches(values, STATION_78958)
    ] == [
        "station_pressure_mismatch",
        "sea_level_mismatch",
    ]
    agreeing = {
        "barometer_reading": "1012.8",
        "station_pressure": "0128",
        "msl_pressure": "0138",
    }
    assert derive.pressure_mismatches(agreeing, STATION_78958) == []


def test_without_station_amounts_nothing_is_assumed() -> None:
    assert derive.pressure_fields({"barometer_reading": "1012.8"}, None) == {}
    assert derive.pressure_mismatches({"station_pressure": "0128"}, None) == []
    found = derive.pressures({"barometer_reading": "1012.8"}, PressureSettings())
    assert (found.station_hpa, found.qfe_hpa, found.qnh_hpa) == (None, None, None)


def test_humidity_uses_the_station_pressure_worked_out_from_the_barometer() -> None:
    values = {"air_temp": "280", "wet_bulb": "240", "barometer_reading": "1015.3"}
    derived = derive.derived_fields(values, STATION_78958)
    assert derived["station_pressure"] == "0153"
    assert derived["dew_point"] == "0224"
    assert derived["relative_humidity"] == "72"


def test_validation_decodes_qfe_and_qnh() -> None:
    row = {
        **PAPER_ROW,
        "station_pressure": "",
        "msl_pressure": "",
        "barometer_reading": "1012.8",
    }
    issues, decoded = rules.validate_synop(
        SynopWorkbook.model_validate(row), STATION_78958
    )
    assert not [i for i in issues if i.severity == "error"]
    assert decoded.station_pressure_pa == 101280
    assert decoded.mean_sea_level_pressure_pa == 101380
    assert decoded.qfe_pa == 101310
    assert decoded.qnh_pa == 101390
