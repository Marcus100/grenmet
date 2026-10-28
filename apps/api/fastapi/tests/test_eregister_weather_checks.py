"""Cross-checks between groups of one SYNOP observation.

Rules and examples come from WMO-No. 306 Vol. I.1 (FM 12 SYNOP): regulations
12.2.6.4 (present weather), 12.2.6.6 (past weather) and 12.4.10 (cloud layers),
Code tables 0200, 4019, 4561 and 4677. Each rule is advice (a warning) unless the
manual makes the combination impossible.
"""

import pytest

from src.eregister import rules
from src.eregister.schemas import SynopWorkbook
from tests.test_eregister_validation import PAPER_ROW


def found(**changes: str) -> set[tuple[str, str, str]]:
    """All issues as (severity, field, code); unlike a dict it keeps duplicates."""
    workbook = SynopWorkbook.model_validate({**PAPER_ROW, **changes})
    issues, _ = rules.validate_synop(workbook)
    return {(i.severity, i.field, i.code) for i in issues}


def has(issues: set[tuple[str, str, str]], field: str, code: str) -> bool:
    return any(f == field and c == code for _, f, c in issues)


# ---- present weather against visibility (12.2.6.4.6, 12.2.6.4.13) ------------


@pytest.mark.parametrize(
    ("visibility", "warns"),
    [("05", True), ("09", True), ("10", False), ("60", False)],
)
def test_mist_needs_a_visibility_of_1000_m_or_more(
    visibility: str, warns: bool
) -> None:
    # VV 05 = 500 m, 09 = 900 m, 10 = 1000 m, 60 = 10 km.
    assert (
        has(
            found(present_wx="10", visibility=visibility),
            "present_wx",
            "mist_visibility",
        )
        is warns
    )


@pytest.mark.parametrize(
    ("ww", "visibility", "warns"),
    [
        ("42", "10", True),  # fog at the station, 1000 m
        ("49", "60", True),
        ("45", "09", False),  # 900 m
        ("41", "60", False),  # patches: station visibility can be higher
        ("40", "60", False),  # fog at a distance
    ],
)
def test_fog_at_the_station_is_ww_42_to_49(
    ww: str, visibility: str, warns: bool
) -> None:
    issues = found(present_wx=ww, visibility=visibility)
    assert has(issues, "present_wx", "fog_visibility") is warns


# ---- present weather against cloud and thunder (12.2.6.4.11) ------------------


@pytest.mark.parametrize(
    ("ww", "total", "warns"),
    [("61", "0", True), ("25", "0", False), ("61", "1", False), ("95", "0", True)],
)
def test_precipitation_needs_cloud(ww: str, total: str, warns: bool) -> None:
    issues = found(present_wx=ww, total_cloud=total)
    assert has(issues, "present_wx", "precipitation_without_cloud") is warns


@pytest.mark.parametrize("ww", ["17", "95", "99"])
def test_thunderstorm_needs_cumulonimbus(ww: str) -> None:
    layer_cb = {
        "s3_layer1_amount": "2",
        "s3_layer1_form": "9",
        "s3_layer1_height": "20",
        "total_cloud": "4",
    }
    assert has(
        found(present_wx=ww, low_cloud_type="1"),
        "present_wx",
        "thunderstorm_without_cb",
    )
    assert not has(
        found(present_wx=ww, low_cloud_type="9"),
        "present_wx",
        "thunderstorm_without_cb",
    )
    assert not has(
        found(present_wx=ww, low_cloud_type="3"),
        "present_wx",
        "thunderstorm_without_cb",
    )
    # A Cb layer group is enough even when CL was keyed as another type.
    assert not has(
        found(present_wx=ww, low_cloud_type="1", **layer_cb),
        "present_wx",
        "thunderstorm_without_cb",
    )
    # CL not reported: nothing to contradict.
    assert not has(found(present_wx=ww), "present_wx", "thunderstorm_without_cb")


# ---- rain recorded but ww and W1W2 show none ----------------------------------


@pytest.mark.parametrize(
    ("hour", "amount", "period", "changes", "warns"),
    [
        ("12", "012", "1", {}, True),  # 12 mm in 6 h, 6 h covered at 12 UTC
        ("12", "991", "1", {}, True),  # 0.1 mm still counts
        ("12", "990", "1", {}, False),  # trace
        ("12", "000", "1", {}, False),  # none
        ("12", "012", "4", {}, False),  # 24 h amount: the rain may be older than W1W2
        ("12", "012", "1", {"past_wx_1": "6", "past_wx_2": "6"}, False),
        ("12", "012", "1", {"present_wx": "61"}, False),
        ("12", "012", "1", {"present_wx": "21"}, False),  # rain in the past hour
        ("10", "003", "5", {}, True),  # hourly report covers 1 h, amount over 1 h
        ("10", "003", "1", {}, False),  # 6 h amount is longer than the 1 h of W1W2
        ("09", "003", "7", {}, True),  # 3 hourly main time: 3 h
        ("09", "003", "5", {}, True),
        ("09", "003", "8", {}, False),  # 9 h
    ],
)
def test_rain_recorded_needs_weather_to_show_it(
    hour: str, amount: str, period: str, changes: dict[str, str], warns: bool
) -> None:
    issues = found(
        time_utc=hour,
        precip_indicator="1",
        precip_amount=amount,
        precip_period=period,
        **changes,
    )
    assert has(issues, "present_wx", "rain_without_weather") is warns


def test_precipitation_reference_periods_match_code_table_4019() -> None:
    assert rules.PRECIPITATION_PERIOD_HOURS == {
        1: 6,
        2: 12,
        3: 18,
        4: 24,
        5: 1,
        6: 2,
        7: 3,
        8: 9,
        9: 15,
    }


@pytest.mark.parametrize(
    ("hour", "hours"),
    [
        (0, 6),
        (6, 6),
        (12, 6),
        (18, 6),
        (3, 3),
        (9, 3),
        (15, 3),
        (21, 3),
        (1, 1),
        (10, 1),
        (23, 1),
    ],
)
def test_past_weather_covers_6_3_or_1_hours_by_report_time(
    hour: int, hours: int
) -> None:
    # 12.2.6.6.1 (a), (b) and (d); hourly reports cover 1 hour.
    assert rules.past_weather_hours(hour) == hours
    assert rules.past_weather_hours(None) is None


# ---- past weather W1W2 (12.2.6.6) ----------------------------------------------


def test_a_single_past_weather_type_is_reported_in_both_w1_and_w2() -> None:
    # "rain during the entire period shall be reported as W1W2 = 66" (12.2.6.6.5).
    assert has(
        found(past_wx_1="6", past_wx_2=""), "past_wx_2", "past_weather_second_missing"
    )
    assert not has(
        found(past_wx_1="6", past_wx_2="6"), "past_wx_2", "past_weather_second_missing"
    )
    assert not has(
        found(past_wx_1="6", past_wx_2="4"), "past_wx_2", "past_weather_second_missing"
    )
    assert not has(
        found(past_wx_1="", past_wx_2=""), "past_wx_2", "past_weather_second_missing"
    )


def test_w1_is_the_higher_code_figure() -> None:
    # 12.2.6.6.4: the highest figure is W1, the second highest W2.
    assert has(found(past_wx_1="4", past_wx_2="6"), "past_wx_1", "past_weather_order")
    assert not has(
        found(past_wx_1="6", past_wx_2="4"), "past_wx_1", "past_weather_order"
    )


# ---- pressure tendency a (Code table 0200) ---------------------------------------


@pytest.mark.parametrize(
    ("tendency", "change", "errors"),
    [
        ("0", "000", False),  # increasing then decreasing: the same or higher
        ("5", "000", False),  # decreasing then increasing: the same or lower
        ("4", "000", False),  # steady
        ("4", "012", True),
        ("1", "000", True),
        ("2", "000", True),
        ("3", "000", True),
        ("6", "000", True),
        ("7", "000", True),
        ("8", "000", True),  # code 8: now lower than three hours ago
        ("8", "015", False),
        ("2", "015", False),
    ],
)
def test_tendency_and_change_agree(tendency: str, change: str, errors: bool) -> None:
    issues = found(pressure_tendency=tendency, pressure_change=change)
    assert has(issues, "pressure_change", "tendency_mismatch") is errors
    if errors:
        assert ("error", "pressure_change", "tendency_mismatch") in issues


# ---- cloud layer selection (12.4.10) ---------------------------------------------


def layers(
    *groups: tuple[str, str, str], total: str = "8", **extra: str
) -> dict[str, str]:
    """Layer groups as (Ns, C, hshs) for layers 1 to 4."""
    values = {"total_cloud": total, **extra}
    for n, (amount, form, height) in enumerate(groups, start=1):
        values[f"s3_layer{n}_amount"] = amount
        values[f"s3_layer{n}_form"] = form
        values[f"s3_layer{n}_height"] = height
    return values


def test_the_second_reported_layer_needs_three_oktas_or_more() -> None:
    low = ("2", "5", "20")
    assert has(
        found(**layers(low, ("2", "3", "40"))),
        "s3_layer2_amount",
        "layer_amount_too_small",
    )
    assert not has(
        found(**layers(low, ("3", "3", "40"))),
        "s3_layer2_amount",
        "layer_amount_too_small",
    )
    # The first layer may be any amount.
    assert not has(
        found(**layers(("1", "5", "20"))), "s3_layer1_amount", "layer_amount_too_small"
    )


def test_the_third_reported_layer_needs_five_oktas_or_more() -> None:
    first, second = ("2", "5", "20"), ("3", "3", "40")
    assert has(
        found(**layers(first, second, ("4", "1", "60"))),
        "s3_layer3_amount",
        "layer_amount_too_small",
    )
    assert not has(
        found(**layers(first, second, ("5", "1", "60"))),
        "s3_layer3_amount",
        "layer_amount_too_small",
    )


def test_cumulonimbus_does_not_count_towards_the_layer_thresholds() -> None:
    # A Cb group of any amount is reported (12.4.10.1 (d)); the next ordinary layer is
    # then still the first reported ordinary layer and may be any amount.
    issues = found(**layers(("2", "9", "20"), ("1", "5", "30")))
    assert not has(issues, "s3_layer2_amount", "layer_amount_too_small")


@pytest.mark.parametrize("cloud_low", ["3", "9"])
def test_cumulonimbus_is_always_reported(cloud_low: str) -> None:
    assert has(
        found(low_cloud_type=cloud_low), "s3_layer1_form", "cumulonimbus_not_reported"
    )
    issues = found(low_cloud_type=cloud_low, **layers(("2", "9", "20")))
    assert not has(issues, "s3_layer1_form", "cumulonimbus_not_reported")
    # The warning points at the next free layer cell.
    issues = found(
        low_cloud_type=cloud_low, **layers(("2", "5", "20"), ("3", "3", "40"))
    )
    assert has(issues, "s3_layer3_form", "cumulonimbus_not_reported")


def test_an_obscured_sky_is_reported_89_with_the_vertical_visibility() -> None:
    assert has(found(total_cloud="9"), "s3_layer1_amount", "obscured_needs_group")
    obscured = layers(("9", "", "02"), total="9")
    issues = found(**obscured)
    assert not has(issues, "s3_layer1_amount", "obscured_needs_group")
    assert not has(issues, "s3_layer1_form", "obscured_layer_form")
    wrong = layers(("9", "5", "02"), total="9")
    assert has(found(**wrong), "s3_layer1_form", "obscured_layer_form")


def test_no_8_group_when_cloud_was_not_observed() -> None:
    assert has(
        found(**layers(("2", "5", "20"), total="/")),
        "s3_layer1_amount",
        "cloud_not_observed",
    )
    assert not has(
        found(**layers(("2", "5", "20"))), "s3_layer1_amount", "cloud_not_observed"
    )


# ---- group 2 with sign 9: relative humidity instead of dew point (Code table 3845) ----


def test_sign_9_in_the_dew_point_group_is_relative_humidity() -> None:
    workbook = SynopWorkbook.model_validate({**PAPER_ROW, "dew_point": "9075"})
    issues, decoded = rules.validate_synop(workbook)
    assert not [i for i in issues if i.field == "dew_point"]
    assert decoded.relative_humidity_percent == 75
    # 28.0 C and 75 per cent: the dew point is about 23.15 C by the Magnus formula.
    assert decoded.dew_point_k == pytest.approx(296.3, abs=0.15)


def test_100_per_cent_humidity_has_the_air_temperature_as_dew_point() -> None:
    workbook = SynopWorkbook.model_validate({**PAPER_ROW, "dew_point": "9100"})
    issues, decoded = rules.validate_synop(workbook)
    assert not [i for i in issues if i.field == "dew_point"]
    assert decoded.relative_humidity_percent == 100
    assert decoded.dew_point_k == pytest.approx(decoded.air_temperature_k, abs=0.05)


def test_zero_humidity_is_accepted_but_has_no_dew_point() -> None:
    workbook = SynopWorkbook.model_validate({**PAPER_ROW, "dew_point": "9000"})
    issues, decoded = rules.validate_synop(workbook)
    assert not [i for i in issues if i.field == "dew_point"]
    assert decoded.relative_humidity_percent == 0
    assert decoded.dew_point_k is None


@pytest.mark.parametrize("group", ["9101", "9999"])
def test_humidity_over_100_per_cent_is_an_error(group: str) -> None:
    assert ("error", "dew_point", "out_of_range") in found(dew_point=group)


@pytest.mark.parametrize("sign", ["2", "5", "8"])
def test_other_sign_digits_are_still_rejected(sign: str) -> None:
    assert ("error", "dew_point", "invalid_sign") in found(dew_point=f"{sign}123")


def test_a_typed_humidity_cell_wins_over_the_group() -> None:
    workbook = SynopWorkbook.model_validate(
        {**PAPER_ROW, "dew_point": "9075", "relative_humidity": "80"}
    )
    _, decoded = rules.validate_synop(workbook)
    assert decoded.relative_humidity_percent == 80


def test_sign_9_group_goes_into_the_message_unchanged() -> None:
    # FM 12 group 2 9UUU is valid as keyed; the TAC encoder passes it through.
    from src.eregister import encode

    workbook = SynopWorkbook.model_validate({**PAPER_ROW, "dew_point": "9075"})
    assert " 29075 " in f" {encode.synop_tac(workbook)} "


# ---- supplementary groups 9SpSpspsp (Code table 3778) ------------------------------


def special(groups: str, **extra: str) -> set[tuple[str, str, str]]:
    return found(s3_special_phenomena=groups, **extra)


def flagged(issues: set[tuple[str, str, str]], code: str) -> bool:
    return has(issues, "s3_special_phenomena", code)


@pytest.mark.parametrize("group", ["90005", "90105", "90505"])
def test_time_groups_for_ww_need_a_present_weather_group(group: str) -> None:
    # 900tt, 901tt and 905tt describe the weather reported by ww in 7wwW1W2.
    assert not flagged(special(group), "time_group_without_weather")
    assert flagged(special(group, present_wx=""), "time_group_without_weather")


@pytest.mark.parametrize("group", ["90206", "90406", "90606", "90706"])
def test_time_groups_describe_the_group_that_follows(group: str) -> None:
    assert flagged(special(group), "time_group_without_target")
    assert not flagged(special(f"{group} 91015"), "time_group_without_target")


def test_903tt_describes_the_group_that_precedes() -> None:
    assert flagged(special("90305"), "time_group_without_target")
    assert not flagged(special("91015 90305"), "time_group_without_target")


def test_group_908_is_not_used() -> None:
    # Unconfirmed against Vol. I.1, so a warning until the table is on file.
    assert ("warning", "s3_special_phenomena", "unused_supplementary") in special(
        "90899"
    )


def test_a_gust_of_99_or_more_is_followed_by_a_00fff_group() -> None:
    # Note 1: a gust of 135 knots is coded 91099 00135.
    assert flagged(special("91099"), "speed_needs_fff")
    assert flagged(special("91099 91312"), "speed_needs_fff")
    ok = special("91099 00135")
    assert not flagged(ok, "speed_needs_fff")
    assert not flagged(ok, "invalid_supplementary")
    # A 00fff group on its own is not a 9-group.
    assert flagged(special("00135"), "invalid_supplementary")


def test_the_highest_mean_wind_is_not_below_the_lowest() -> None:
    assert flagged(special("91210 91420"), "mean_wind_order")
    assert not flagged(special("91220 91410"), "mean_wind_order")
    # Wide speeds compare as three digits: 912 with 00110 is above 914 with 00105.
    assert not flagged(special("91299 00110 91499 00105"), "mean_wind_order")


def test_repeating_a_wind_change_pair_is_not_a_duplicate() -> None:
    # Note 3: a significant change is two 913ff and two 915dd groups with 906tt between.
    change = "91312 91509 90605 91320 91527"
    assert not flagged(special(change), "duplicate_supplementary")
    assert flagged(special("91012 91012"), "duplicate_supplementary")


@pytest.mark.parametrize(
    ("group", "bad"),
    [("91536", False), ("91599", False), ("91537", True), ("91550", True)],
)
def test_wind_direction_group_is_tens_of_degrees(group: str, bad: bool) -> None:
    assert (("error", "s3_special_phenomena", "out_of_range") in special(group)) is bad


@pytest.mark.parametrize(
    ("group", "ok"),
    [
        ("90911", True),  # Rt 1: under an hour ago, dc 1: lasted 1 to 3 hours
        ("90929", True),
        ("90999", True),  # both unknown
        ("90901", False),  # Rt 0 does not exist
        ("90918", False),  # dc 8 is not used
    ],
)
def test_group_909_codes_follow_the_code_tables(group: str, ok: bool) -> None:
    issues = found(
        s3_group_909=group, precip_indicator="1", precip_amount="005", precip_period="1"
    )
    assert (("error", "s3_group_909", "invalid_909") in issues) is not ok


def test_group_909_needs_a_rainfall_group() -> None:
    assert has(
        found(s3_group_909="90911"), "s3_group_909", "group_909_without_rainfall"
    )
    with_rain = found(
        s3_group_909="90911",
        precip_indicator="1",
        precip_amount="005",
        precip_period="1",
    )
    assert not has(with_rain, "s3_group_909", "group_909_without_rainfall")
    omitted = found(
        s3_group_909="90911",
        precip_indicator="4",
        precip_amount="005",
        precip_period="1",
    )
    assert has(omitted, "s3_group_909", "group_909_without_rainfall")


def test_group_909_inside_the_special_phenomena_field_is_checked_too() -> None:
    assert ("error", "s3_special_phenomena", "invalid_909") in special("90901")
