"""SYNOP register rules (WMO-No. 306 Vol. I.2, B/C1) and the validate endpoint."""

from collections.abc import Iterator
from uuid import uuid4

import httpx
import pytest

from src.auth.browser import get_browser_or_token_user
from src.auth.models import User
from src.eregister import encode, rules
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
    issues, _ = check(total_cloud="8", **layers)
    assert issues["error:s3_layer4_amount"] == "too_many_layers"
    # A fourth layer is allowed when it is Cumulonimbus (B/C1.4.5.1.1).
    cb = {**layers, "s3_layer4_form": "9"}
    issues, _ = check(total_cloud="8", **cb)
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


# --- WMO conformance: indicators, groups and code-table rules ------------------


def only_errors(issues: dict[str, str]) -> dict[str, str]:
    return {k: v for k, v in issues.items() if k.startswith("error")}


@pytest.mark.parametrize(
    ("speed", "error", "warning"),
    [
        ("15", None, None),
        ("99", None, "speed_needs_fff"),  # ff=99 means 99 or more: needs 00fff
        ("105", None, None),
        ("098", "wrong_length", None),
        ("1", "wrong_length", None),
        ("1x", "not_integer", None),
    ],
)
def test_wind_speed_ff_and_00fff(
    speed: str, error: str | None, warning: str | None
) -> None:
    issues, decoded = check(wind_speed=speed)
    assert issues.get("error:wind_speed") == error
    assert issues.get("warning:wind_speed") == warning
    if speed == "105":
        assert decoded.wind_speed_ms == 54.0  # 105 kt


def test_gust_accepts_three_digits() -> None:
    issues, decoded = check(wind_speed="60", wind_gust="110")
    assert "error:wind_gust" not in issues
    assert decoded.wind_gust_ms == 56.6


@pytest.mark.parametrize(
    ("changes", "key", "code"),
    [
        # iR 3 and 4: group 6 omitted. iR 0, 1, 2: group 6 included.
        (
            {"precip_indicator": "3", "precip_amount": "005", "precip_period": "1"},
            "error:precip_amount",
            "indicator_conflict",
        ),
        (
            {"precip_indicator": "4", "precip_amount": "005", "precip_period": "1"},
            "error:precip_amount",
            "indicator_conflict",
        ),
        ({"precip_indicator": "0"}, "warning:precip_amount", "missing_group"),
        ({"precip_indicator": "2"}, "warning:precip_amount", "missing_group"),
        # ix 2, 3, 5, 6: group 7 omitted. ix 1, 4, 7: included.
        ({"station_wx_indicator": "2"}, "error:present_wx", "indicator_conflict"),
        ({"station_wx_indicator": "6"}, "error:present_wx", "indicator_conflict"),
        (
            {
                "station_wx_indicator": "1",
                "present_wx": "",
                "past_wx_1": "",
                "past_wx_2": "",
            },
            "warning:present_wx",
            "missing_group",
        ),
    ],
)
def test_iR_and_ix_agree_with_the_groups_present(
    changes: dict[str, str], key: str, code: str
) -> None:
    issues, _ = check(**changes)
    assert issues[key] == code


def test_iR_with_omitted_group_and_ix_with_omitted_weather_are_clean() -> None:
    issues, _ = check(
        precip_indicator="3",
        station_wx_indicator="2",
        present_wx="",
        past_wx_1="",
        past_wx_2="",
    )
    assert only_errors(issues) == {}
    assert "warning:precip_amount" not in issues
    assert "warning:present_wx" not in issues


@pytest.mark.parametrize(
    ("tendency", "change", "code"),
    [
        ("4", "000", None),
        ("4", "012", "tendency_mismatch"),
        ("2", "000", "tendency_mismatch"),
        ("7", "000", "tendency_mismatch"),
        ("0", "000", None),  # higher or the same
        ("5", "000", None),  # lower or the same
        ("2", "012", None),
    ],
)
def test_pressure_tendency_agrees_with_change(
    tendency: str, change: str, code: str | None
) -> None:
    issues, _ = check(pressure_tendency=tendency, pressure_change=change)
    assert issues.get("error:pressure_change") == code


def test_5appp_needs_both_parts() -> None:
    issues, _ = check(pressure_tendency="2", pressure_change="")
    assert issues["warning:pressure_change"] == "missing_group"
    issues, _ = check(pressure_tendency="", pressure_change="012")
    assert issues["warning:pressure_tendency"] == "missing_group"


def test_past_weather_w1_carries_the_higher_code() -> None:
    issues, _ = check(past_wx_1="3", past_wx_2="6")
    assert issues["warning:past_wx_1"] == "past_weather_order"
    issues, _ = check(past_wx_1="6", past_wx_2="3")
    assert "warning:past_wx_1" not in issues


def test_cloud_types_are_zero_when_there_is_no_cloud() -> None:
    issues, _ = check(total_cloud="0", low_cloud_amount="0", low_cloud_type="3")
    assert issues["error:low_cloud_type"] == "type_without_cloud"
    issues, _ = check(
        total_cloud="3", low_cloud_amount="0", low_cloud_type="0", mid_cloud_type="2"
    )
    assert issues["error:mid_cloud_type"] == "type_without_cloud"
    issues, _ = check(total_cloud="3", low_cloud_amount="0", high_cloud_type="1")
    assert "error:high_cloud_type" not in issues


def test_layer_amount_cannot_exceed_total_cloud() -> None:
    issues, _ = check(
        total_cloud="3",
        low_cloud_amount="3",
        s3_layer1_amount="5",
        s3_layer1_form="2",
        s3_layer1_height="10",
    )
    assert issues["error:s3_layer1_amount"] == "layer_exceeds_total"


def test_layer_heights_follow_code_table_1677() -> None:
    issues, _ = check(
        total_cloud="3",
        s3_layer1_amount="2",
        s3_layer1_form="2",
        s3_layer1_height="53",
    )
    assert issues["error:s3_layer1_height"] == "unused_code"
    # 81 to 89 continue in 1500 m steps from 10 500 m, so they still order layers.
    issues, _ = check(
        total_cloud="8",
        low_cloud_amount="2",
        s3_layer1_amount="2",
        s3_layer1_form="0",
        s3_layer1_height="82",
        s3_layer2_amount="3",
        s3_layer2_form="2",
        s3_layer2_height="70",
    )
    assert issues["warning:s3_layer2_height"] == "layer_order"
    assert rules.layer_height_metres(80) == 9000
    assert rules.layer_height_metres(81) == 10500
    assert rules.layer_height_metres(88) == 21000


def test_negative_zero_is_a_coding_error_in_practice() -> None:
    issues, _ = check(air_temp="1000", dew_point="1000")
    assert issues["warning:air_temp"] == "negative_zero"
    issues, _ = check(air_temp="0000", dew_point="0000")
    assert "warning:air_temp" not in issues


def test_deep_pressure_is_valid_in_a_hurricane() -> None:
    # Tropical cyclone MSL pressures fall below 900 hPa; the WMO extreme range is 870-1085.7.
    issues, decoded = check(msl_pressure="8820", station_pressure="8800")
    assert "error:msl_pressure" not in issues
    assert decoded.mean_sea_level_pressure_pa == 88200
    issues, _ = check(msl_pressure="8000")
    assert issues["error:msl_pressure"] == "out_of_range"


def test_fog_at_station_needs_low_visibility() -> None:
    issues, _ = check(present_wx="45", visibility="60")
    assert issues["warning:present_wx"] == "fog_visibility"
    issues, _ = check(present_wx="45", visibility="05")
    assert "warning:present_wx" not in issues
    issues, _ = check(present_wx="40", visibility="60")  # fog at a distance
    assert "warning:present_wx" not in issues


def test_non_synoptic_hour_is_advised() -> None:
    issues, _ = check(time_utc="07")
    assert issues["warning:time_utc"] == "non_synoptic_hour"
    issues, _ = check(time_utc="09")
    assert "warning:time_utc" not in issues


def test_24h_pressure_change_group_is_j1_and_three_digits() -> None:
    issues, _ = check(s3_baro_change_24h="8012")
    assert "error:s3_baro_change_24h" not in issues
    assert "warning:s3_baro_change_24h" not in issues
    issues, _ = check(s3_baro_change_24h="012")
    assert issues["error:s3_baro_change_24h"] == "invalid_format"
    for bad in ("2012", "5012", "7012"):
        issues, _ = check(s3_baro_change_24h=bad)
        assert issues["error:s3_baro_change_24h"] == "invalid_sign"


# --- remaining section 3 and section 5 rules (conformance checklist) --------------


def tac(**changes: str) -> str:
    return encode.synop_tac(SynopWorkbook.model_validate({**PAPER_ROW, **changes}))


def test_pressure_change_24h_selects_group_58_or_59_and_decodes_the_sign() -> None:
    _, rise = check(s3_baro_change_24h="8035")
    _, fall = check(s3_baro_change_24h="9035")
    assert rise.pressure_change_24h_pa == 350
    assert fall.pressure_change_24h_pa == -350
    assert tac(s3_baro_change_24h="8035").endswith("58035=")
    assert tac(s3_baro_change_24h="9035").endswith("59035=")


def test_pressure_change_24h_register_entries_encode_as_groups_58_and_59() -> None:
    # Paper register columns 43-44: "58 004", "59 011", "59 010".
    for keyed, group in (("8004", "58004"), ("9011", "59011"), ("9010", "59010")):
        assert tac(s3_baro_change_24h=keyed).endswith(f"{group}=")
    _, fall = check(s3_baro_change_24h="9011")
    assert fall.pressure_change_24h_pa == -110


def test_pressure_change_24h_legacy_0_and_1_still_encode_with_a_warning() -> None:
    issues, rise = check(s3_baro_change_24h="0035")
    assert issues["warning:s3_baro_change_24h"] == "legacy_sign"
    assert "error:s3_baro_change_24h" not in issues
    assert rise.pressure_change_24h_pa == 350
    issues, fall = check(s3_baro_change_24h="1035")
    assert issues["warning:s3_baro_change_24h"] == "legacy_sign"
    assert fall.pressure_change_24h_pa == -350
    assert tac(s3_baro_change_24h="0035").endswith("58035=")
    assert tac(s3_baro_change_24h="1035").endswith("59035=")


def test_pressure_change_24h_negative_zero_and_implausible_values_warn() -> None:
    issues, _ = check(s3_baro_change_24h="9000")
    assert issues["warning:s3_baro_change_24h"] == "negative_zero"
    issues, _ = check(s3_baro_change_24h="8450")
    assert issues["warning:s3_baro_change_24h"] == "implausible_change"
    issues, _ = check(s3_baro_change_24h="8400")
    assert "warning:s3_baro_change_24h" not in issues


def test_max_and_min_temperature_are_advised_at_main_hours_only() -> None:
    issues, _ = check(time_utc="09", s3_max_temp="0310", s3_min_temp="0240")
    assert issues["warning:s3_max_temp"] == "txtn_hour"
    assert issues["warning:s3_min_temp"] == "txtn_hour"
    for hour in ("00", "06", "12", "18"):
        issues, _ = check(time_utc=hour, s3_max_temp="0310", s3_min_temp="0240")
        assert "warning:s3_max_temp" not in issues, hour


def test_air_temperature_outside_the_reported_extremes_warns() -> None:
    issues, _ = check(s3_max_temp="0250")  # air is 28.0
    assert issues["warning:s3_max_temp"] == "air_above_max"
    issues, _ = check(s3_min_temp="0290")
    assert issues["warning:s3_min_temp"] == "air_below_min"


def test_sunshine_is_hours_and_tenths_up_to_24() -> None:
    issues, decoded = check(s3_sunshine_24h="087")
    assert "error:s3_sunshine_24h" not in issues
    assert decoded.sunshine_24h_hours == 8.7
    issues, decoded = check(s3_sunshine_24h="241")
    assert issues["error:s3_sunshine_24h"] == "out_of_range"
    assert decoded.sunshine_24h_hours is None
    issues, _ = check(s3_sunshine_24h="24")
    assert issues["error:s3_sunshine_24h"] == "invalid_format"
    issues, _ = check(s3_sunshine_24h="240")
    assert "error:s3_sunshine_24h" not in issues


def test_sunshine_is_reported_at_the_daily_summary_hour() -> None:
    issues, _ = check(time_utc="15", s3_sunshine_24h="087")
    assert issues["warning:s3_sunshine_24h"] == "sunshine_hour"
    issues, _ = check(time_utc="12", s3_sunshine_24h="087")
    assert "warning:s3_sunshine_24h" not in issues


def test_state_of_ground_uses_code_table_0901() -> None:
    for code in "0123456789":
        issues, _ = check(s3_ground_state=code, air_temp="030")
        assert "error:s3_ground_state" not in issues, code
    issues, _ = check(s3_ground_state="A")
    assert issues["error:s3_ground_state"] == "not_integer"
    _, decoded = check(s3_ground_state="2")
    assert decoded.ground_state == 2


def test_ground_jjj_is_three_digits_and_needs_a_state() -> None:
    issues, _ = check(s3_ground_state="2", s3_ground_jjj="012")
    assert "error:s3_ground_jjj" not in issues
    issues, _ = check(s3_ground_state="2", s3_ground_jjj="12")
    assert issues["error:s3_ground_jjj"] == "invalid_format"
    issues, _ = check(s3_ground_jjj="012")
    assert issues["warning:s3_ground_state"] == "missing_group"


def test_frozen_ground_in_warm_air_warns() -> None:
    issues, _ = check(s3_ground_state="4")  # air 28.0
    assert issues["warning:s3_ground_state"] == "ground_state_air"
    issues, _ = check(s3_ground_state="4", air_temp="1020", dew_point="1030")
    assert "warning:s3_ground_state" not in issues
    issues, _ = check(s3_ground_state="2")
    assert "warning:s3_ground_state" not in issues


def test_supplementary_gust_groups_910ff_and_911ff_are_both_accepted() -> None:
    for group in ("91025", "91125"):
        issues, _ = check(s3_special_phenomena=group)
        assert [key for key in issues if "special" in key] == [], group


def test_supplementary_groups_are_checked_for_format_and_gusts() -> None:
    issues, _ = check(s3_special_phenomena="9102")
    assert issues["error:s3_special_phenomena"] == "invalid_supplementary"
    issues, _ = check(s3_special_phenomena="81025")
    assert issues["error:s3_special_phenomena"] == "invalid_supplementary"
    issues, _ = check(s3_special_phenomena="91005")  # mean is 15
    assert issues["warning:s3_special_phenomena"] == "gust_below_mean"
    issues, _ = check(s3_special_phenomena="91025 91030")
    assert issues["warning:s3_special_phenomena"] == "duplicate_supplementary"
    issues, _ = check(s3_special_phenomena="91025", wind_gust="25")
    assert issues["warning:s3_special_phenomena"] == "duplicate_gust"


def test_supplementary_weather_960ww_is_accepted_and_others_pass_through() -> None:
    issues, _ = check(s3_special_phenomena="96017")
    assert [key for key in issues if "special" in key] == []
    issues, _ = check(s3_special_phenomena="93012")
    assert issues["warning:s3_special_phenomena"] == "unchecked_supplementary"
    assert "error:s3_special_phenomena" not in issues


def test_section_5_national_groups_are_preserved_without_validation() -> None:
    national = "NAT 12 /// xx9"
    issues, _ = check(s5_national=national)
    assert [key for key in issues if "s5" in key] == []
    assert tac(s5_national=national).endswith(f"555 {national}=")


def test_tac_orders_the_new_section_3_groups() -> None:
    message = tac(
        s3_max_temp="0310",
        s3_ground_state="2",
        s3_ground_jjj="012",
        s3_sunshine_24h="087",
        s3_baro_change_24h="9015",
        s3_special_phenomena="91125 96017",
    )
    assert "333 10310 32012 55087 59015 91125 96017=" in message


def test_workbook_day_and_hour_must_match_the_observation_time() -> None:
    from datetime import UTC, datetime, timedelta, timezone

    book = SynopWorkbook.model_validate({**PAPER_ROW})
    day = int(PAPER_ROW["day"])
    hour = int(PAPER_ROW["time_utc"])
    at = datetime(2023, 3, day, hour, 0, tzinfo=UTC)
    assert rules.check_observation_time(book, at) == []
    # The same instant written in another zone is still the same UTC time.
    local = at.astimezone(timezone(timedelta(hours=-4)))
    assert rules.check_observation_time(book, local) == []
    wrong = rules.check_observation_time(book, at + timedelta(hours=3))
    assert [(i.field, i.code, i.severity) for i in wrong] == [
        ("time_utc", "time_mismatch", "error")
    ]
    both = rules.check_observation_time(book, at + timedelta(days=1, hours=3))
    assert [i.field for i in both] == ["day", "time_utc"]
    blank = SynopWorkbook.model_validate({"day": "", "time_utc": ""})
    assert rules.check_observation_time(blank, at) == []
