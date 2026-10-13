"""SYNOP register rules (WMO-No. 306 Vol. I.2, B/C1) and the validate endpoint."""

from collections.abc import Iterator
from uuid import uuid4

import httpx
import pytest

from src.auth.browser import get_browser_or_token_user
from src.auth.models import User
from src.eregister import rules
from src.eregister.schemas import SynopDecoded, SynopWorkbook
from src.main import app

# Row 1 of the paper register for Thursday 30 March 2023 (station 78958, 12 UTC).
PAPER_ROW = {
    "report_type": "AAXX",
    "day": "30",
    "time_utc": "12",
    "wind_indicator": "4",
    "station_id": "78958",
    "precip_indicator": "4",
    "station_wx_indicator": "1",
    "cloud_base": "4",
    "visibility": "68",
    "total_cloud": "1",
    "wind_dir": "07",
    "wind_speed": "15",
    "air_temp": "280",
    "dew_point": "213",
    "station_pressure": "0153",
    "msl_pressure": "0163",
    "present_wx": "06",
    "past_wx_1": "0",
    "past_wx_2": "0",
}


def check(**changes: str) -> tuple[dict[str, str], SynopDecoded]:
    workbook = SynopWorkbook.model_validate({**PAPER_ROW, **changes})
    issues, decoded = rules.validate_synop(workbook)
    return {f"{i.severity}:{i.field}": i.code for i in issues}, decoded


def test_paper_register_row_is_valid_and_decodes_to_si() -> None:
    issues, decoded = check()
    assert [key for key in issues if key.startswith("error")] == []
    # The 12 UTC main hour expects the 24 h rainfall (advice only).
    assert issues == {"warning:s3_rainfall_24h": "missing_24h_rainfall"}
    assert decoded.international_data_subcategory == 2
    assert decoded.air_temperature_k == 301.15
    assert decoded.dew_point_k == 294.45
    assert decoded.station_pressure_pa == 101530
    assert decoded.mean_sea_level_pressure_pa == 101630
    assert decoded.wind_direction_deg == 70
    assert decoded.wind_speed_ms == 7.7  # 15 kt
    assert decoded.visibility_m == 18000
    assert decoded.total_cloud_percent == 13  # 1 okta
    assert decoded.is_nil_report is False


def test_degrees_are_rejected_for_wind_direction() -> None:
    # The old form prefilled 070; the register keys tens of degrees.
    issues, _ = check(wind_dir="070")
    assert issues["error:wind_dir"] == "wrong_length"


@pytest.mark.parametrize(
    ("changes", "key", "code"),
    [
        ({"report_type": "METAR"}, "error:report_type", "invalid_code"),
        ({"station_id": "7895"}, "error:station_id", "invalid_station"),
        ({"day": ""}, "error:day", "required"),
        ({"time_utc": "24"}, "error:time_utc", "out_of_range"),
        ({"wind_indicator": "2"}, "error:wind_indicator", "invalid_code"),
        ({"wind_dir": "37"}, "error:wind_dir", "out_of_range"),
        ({"wind_dir": "00"}, "error:wind_dir", "inconsistent_calm"),
        ({"dew_point": "290"}, "error:dew_point", "dew_above_air"),
        ({"air_temp": "2x4"}, "error:air_temp", "invalid_format"),
        ({"air_temp": "2254"}, "error:air_temp", "invalid_sign"),
        ({"msl_pressure": "1500"}, "error:msl_pressure", "out_of_range"),
        ({"total_cloud": "0"}, "error:low_cloud_amount", None),
        ({"present_wx": "100"}, "error:present_wx", "wrong_length"),
        (
            {"s3_max_temp": "0250", "s3_min_temp": "0260"},
            "error:s3_max_temp",
            "max_below_min",
        ),
    ],
)
def test_invalid_entries_are_errors(
    changes: dict[str, str], key: str, code: str | None
) -> None:
    changes = {"low_cloud_amount": "2", **changes}
    issues, _ = check(**changes)
    assert key in issues
    if code:
        assert issues[key] == code


def test_unobserved_slashes_decode_to_missing_without_errors() -> None:
    issues, decoded = check(visibility="//", total_cloud="/", air_temp="////")
    assert not [key for key in issues if key.startswith("error")]
    assert decoded.visibility_m is None
    assert decoded.air_temperature_k is None


def test_no_cloud_means_no_low_cloud_amount_and_no_base() -> None:
    issues, _ = check(total_cloud="0", low_cloud_amount="0", cloud_base="4")
    assert issues["warning:cloud_base"] == "base_without_cloud"
    assert not [key for key in issues if key.startswith("error")]


def test_cloud_layers_follow_the_manned_station_limits() -> None:
    layers = {
        f"s3_layer{n}_{part}": value
        for n in (1, 2, 3, 4)
        for part, value in (("amount", "2"), ("form", "8"), ("height", "20"))
    }
    issues, _ = check(**layers)
    assert issues["error:s3_layer4_amount"] == "too_many_layers"
    # A fourth layer is allowed when it is Cumulonimbus (B/C1.4.5.1.1).
    cb = {**layers, "s3_layer4_form": "9"}
    issues, _ = check(**cb)
    assert "error:s3_layer4_amount" not in issues


def test_layers_must_rise_and_be_complete() -> None:
    issues, _ = check(
        s3_layer1_amount="2",
        s3_layer1_form="8",
        s3_layer1_height="40",
        s3_layer2_amount="3",
        s3_layer2_form="6",
        s3_layer2_height="10",
        s3_layer3_amount="1",
    )
    assert issues["warning:s3_layer2_height"] == "layer_order"
    assert issues["warning:s3_layer3_amount"] == "incomplete_layer"


def test_warnings_do_not_make_the_workbook_invalid() -> None:
    issues, _ = check(station_pressure="")
    assert issues["warning:station_pressure"] == "missing_station_pressure"
    assert not [key for key in issues if key.startswith("error")]


def test_negative_temperature_and_trace_precipitation() -> None:
    _, decoded = check(air_temp="1034", dew_point="1040", precip_amount="990")
    assert decoded.air_temperature_k == 269.75
    assert decoded.precipitation_kg_m2 == -0.1
    _, decoded = check(precip_amount="995")
    assert decoded.precipitation_kg_m2 == 0.5


@pytest.mark.parametrize(
    ("hour", "category"), [("12", 2), ("00", 2), ("09", 1), ("21", 1), ("13", 0)]
)
def test_international_data_subcategory_follows_the_hour(
    hour: str, category: int
) -> None:
    _, decoded = check(time_utc=hour)
    assert decoded.international_data_subcategory == category


def test_identification_only_is_a_nil_report() -> None:
    workbook = SynopWorkbook.model_validate(
        {key: PAPER_ROW[key] for key in rules.IDENTIFICATION}
    )
    issues, decoded = rules.validate_synop(workbook)
    assert decoded.is_nil_report is True
    assert [i.code for i in issues if i.severity == "warning"] == ["nil_report"]


@pytest.fixture
def validate_client() -> Iterator[httpx.AsyncClient]:
    user = User(
        id=uuid4(),
        email="observer@example.test",
        is_active=True,
        is_superuser=True,
        registration_pending=False,
    )
    app.dependency_overrides[get_browser_or_token_user] = lambda: user
    try:
        yield httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )
    finally:
        app.dependency_overrides.pop(get_browser_or_token_user, None)


async def test_validate_endpoint_reports_severity_and_decoded_values(
    validate_client: httpx.AsyncClient,
) -> None:
    async with validate_client as client:
        ok = await client.post(
            "/api/v1/eregister/observations/validate-synop",
            json={"workbook": PAPER_ROW},
        )
        bad = await client.post(
            "/api/v1/eregister/observations/validate-synop",
            json={"workbook": {**PAPER_ROW, "wind_dir": "070"}},
        )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["valid"] is True
    assert body["issues"][0]["severity"] == "warning"
    assert body["decoded"]["mean_sea_level_pressure_pa"] == 101630
    assert bad.json()["valid"] is False


def test_variable_wind_decodes_to_direction_zero_with_speed() -> None:
    # B/C1.10.5.3.2: variable is direction 0 with a positive speed (TAC dd 99).
    _, decoded = check(wind_dir="99", wind_speed="08")
    assert decoded.wind_direction_deg == 0
    assert decoded.wind_speed_ms == 4.1


def test_visibility_over_70km_is_81900_metres() -> None:
    # B/C1.4.2.2.2
    _, decoded = check(visibility="89")
    assert decoded.visibility_m == 81900


def test_unused_visibility_codes_are_errors() -> None:
    issues, decoded = check(visibility="52")
    assert issues["error:visibility"] == "unused_code"
    assert decoded.visibility_m is None


def test_gust_and_relative_humidity_decode_and_validate() -> None:
    issues, decoded = check(wind_gust="22", relative_humidity="86")
    assert not [key for key in issues if key.startswith("error")]
    assert decoded.wind_gust_ms == 11.3  # 22 kt
    assert decoded.relative_humidity_percent == 86
    issues, _ = check(wind_gust="05", relative_humidity="101")
    assert issues["warning:wind_gust"] == "gust_below_mean"
    assert issues["error:relative_humidity"] == "out_of_range"


def test_wet_bulb_is_checked_against_air_and_dew_point() -> None:
    issues, decoded = check(wet_bulb="0233")
    assert not [key for key in issues if key.startswith("error")]
    assert decoded.wet_bulb_k == 296.45
    issues, _ = check(wet_bulb="0300")
    assert issues["warning:wet_bulb"] == "wet_above_air"
    issues, _ = check(wet_bulb="0200")
    assert issues["warning:dew_point"] == "dew_above_wet"
    issues, _ = check(wet_bulb="2x3")
    assert issues["error:wet_bulb"] == "invalid_format"


def test_observer_initials_do_not_make_a_nil_report_a_data_report() -> None:
    workbook = SynopWorkbook.model_validate(
        {
            **{key: PAPER_ROW[key] for key in rules.IDENTIFICATION},
            "observer_initials": "MW",
        }
    )
    _, decoded = rules.validate_synop(workbook)
    assert decoded.is_nil_report is True
