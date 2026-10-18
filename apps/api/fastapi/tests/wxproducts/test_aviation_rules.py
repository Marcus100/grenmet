"""METAR/SPECI/TAF coding rules (FM 15/16/51, ICAO Annex 3 App. 3 and 5)."""

from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest

from src.auth.models import User
from src.main import app
from src.wxproducts.aviation_rules import Kind, validate_aviation
from src.wxproducts.dependencies import ProductAuthor, get_author

METAR = "METAR TGPY 181200Z 08012KT 9999 FEW020 SCT120 31/24 Q1014 NOSIG="
TAF = (
    "TAF TGPY 180500Z 1806/1906 08012KT 9999 FEW020 SCT120 "
    "TEMPO 1810/1814 4000 SHRA BKN015CB BECMG 1822/1824 05008KT="
)


def codes(message: str, kind: Kind = "METAR", **kwargs) -> dict[str, str]:
    issues = validate_aviation(kind, "TGPY", message, **kwargs)
    return {f"{i.severity}:{i.code}": i.group or "" for i in issues}


def errors(message: str, kind: Kind = "METAR", **kwargs) -> set[str]:
    return {k.split(":")[1] for k in codes(message, kind, **kwargs) if k[0] == "e"}


def test_routine_metar_and_taf_are_clean() -> None:
    assert codes(METAR) == {}
    # The BECMG only turns the wind 30 degrees: advisory change-criteria warning.
    assert codes(TAF, "TAF") == {"warning:taf_change_criteria": "BECMG"}


def test_station_type_and_time_must_match_draft() -> None:
    assert "station_mismatch" in errors(METAR.replace("TGPY", "TGPZ"))
    assert "type_mismatch" in errors(METAR.replace("METAR", "SPECI", 1))
    assert "time_mismatch" in errors(
        METAR, observed_at=datetime(2026, 9, 18, 13, 0, tzinfo=UTC)
    )
    assert errors(METAR, observed_at=datetime(2026, 9, 18, 12, 0, tzinfo=UTC)) == set()
    assert "missing_type" in errors(METAR[6:])


def test_metar_minutes_warning_and_nil() -> None:
    assert "warning:metar_minutes" in codes(METAR.replace("1200Z", "1215Z"))
    assert codes("METAR TGPY 181200Z NIL=") == {}
    assert "nil_content" in errors("METAR TGPY 181200Z NIL 08012KT=")


def test_terminator_and_case() -> None:
    assert "warning:no_terminator" in codes(METAR[:-1])
    assert "lowercase" in errors(METAR.lower())


@pytest.mark.parametrize(
    ("wind", "code"),
    [
        ("00000KT", None),
        ("36008KT", None),
        ("VRB02KT", None),
        ("08012G22KT", None),
        ("08012G18KT", "wind_gust"),  # gust must exceed mean by 10 kt
        ("00008KT", "wind_north"),
        ("08000KT", "wind_calm"),
        ("08512KT", "wind_direction"),  # direction in 10 degree steps
        ("37012KT", "wind_direction"),
    ],
)
def test_wind_group(wind: str, code: str | None) -> None:
    found = errors(METAR.replace("08012KT", wind))
    assert found == ({code} if code else set())


def test_vrb_with_strong_wind_is_advisory() -> None:
    assert "warning:wind_vrb" in codes(METAR.replace("08012KT", "VRB08KT"))


@pytest.mark.parametrize(
    ("variation", "code"),
    [
        ("040V120", None),
        ("040V080", "variation_extent"),  # under 60 degrees
        ("040V230", "variation_extent"),  # 180 or more is VRB
        ("350V050", "variation_extent"),  # 80 degrees through north: fine?
    ],
)
def test_wind_variation_extent(variation: str, code: str | None) -> None:
    found = errors(METAR.replace("08012KT", f"08012KT {variation}"))
    if variation == "350V050":
        assert found == set()  # 60 degrees clockwise across north
    else:
        assert found == ({code} if code else set())


def test_wind_variation_needs_three_knots_and_not_vrb() -> None:
    assert "variation_speed" in errors(METAR.replace("08012KT", "08002KT 040V120"))
    assert "variation_with_vrb" in errors(METAR.replace("08012KT", "VRB02KT 040V120"))


@pytest.mark.parametrize(
    ("visibility", "ok"),
    [
        ("9999", True),
        ("0750", True),
        ("0725", False),
        ("4800", True),
        ("4850", False),
        ("6000", True),
        ("6500", False),
        ("9500", False),
    ],
)
def test_visibility_steps(visibility: str, ok: bool) -> None:
    found = errors(METAR.replace("9999", visibility))
    assert ("visibility_step" not in found) is ok


def test_minimum_visibility_needs_direction_and_lower_value() -> None:
    base = METAR.replace("9999", "3000 1200SW")
    assert errors(base) == set()
    assert "minvis_direction" in errors(METAR.replace("9999", "3000 1200"))
    assert "minvis_value" in errors(METAR.replace("9999", "3000 3000SW"))
    assert "warning:minvis_criteria" in codes(METAR.replace("9999", "3000 2500SW"))


def test_rvr_rules() -> None:
    low = "0600 R10/0600U"
    assert errors(METAR.replace("9999", low)) == set()
    assert "rvr_step" in errors(METAR.replace("9999", "0600 R10/0620"))
    assert "rvr_step" in errors(METAR.replace("9999", "0900 R10/0950"))
    assert "rvr_range" in errors(METAR.replace("9999", "0600 R10/2500"))
    assert errors(METAR.replace("9999", "0600 R10/P2000")) == set()
    assert "rvr_limit" in errors(METAR.replace("9999", "0600 R10/P1500"))
    assert "rvr_runway" in errors(METAR.replace("9999", "0600 R40/0600"))
    assert "warning:rvr_missing" in codes(METAR.replace("9999", "0600"))
    assert (
        "R10L/0400V0800"
        and errors(METAR.replace("9999", "0600 R10L/0400V0800")) == set()
    )


@pytest.mark.parametrize(
    ("weather", "vis", "code"),
    [
        ("-RA", "9999", None),
        ("+TSRA", "3000", None),
        ("VCSH", "9999", None),
        ("FZRA", "3000", None),
        ("MIFG", "2000", None),
        ("SHDZ", "9999", "weather_combination"),
        ("MIRA", "9999", "weather_combination"),
        ("FZSN", "9999", "weather_combination"),
        ("VCRA", "9999", "weather_combination"),
        ("-FG", "0500", "weather_combination"),
        ("FG", "2000", "fog_visibility"),
        ("BR", "0800", "mist_visibility"),
        ("BR", "6000", "mist_visibility"),
        ("BR", "3000", None),
        ("HZ", "9999", "reduction_visibility"),
    ],
)
def test_present_weather(weather: str, vis: str, code: str | None) -> None:
    message = METAR.replace("9999", f"{vis} {weather}")
    found = errors(message) - {"cloud_progression"}
    assert found == ({code} if code else set())


@pytest.mark.parametrize(
    ("clouds", "code"),
    [
        ("FEW020 SCT120", None),
        ("FEW020 SCT040 BKN100", None),
        ("SCT020 FEW040", "cloud_progression"),  # 2nd layer must be SCT+
        ("FEW020 SCT040 SCT100", "cloud_progression"),  # 3rd must be BKN+
        ("SCT040 SCT020", "cloud_order"),
        ("FEW020CB SCT040", None),
        ("FEW020 SCT040 BKN100 OVC200 FEW030CB", "cloud_layers"),
        ("FEW125", "cloud_height_step"),
        ("NSC", None),
        ("VV002", None),
        ("NSC FEW020", "cloud_conflict"),
        ("FEW020 NSC", "cloud_conflict"),
    ],
)
def test_cloud_groups(clouds: str, code: str | None) -> None:
    found = errors(METAR.replace("FEW020 SCT120", clouds))
    assert (code in found) if code else not found


def test_cavok() -> None:
    cavok = "METAR TGPY 181200Z 08012KT CAVOK 31/24 Q1014="
    assert codes(cavok) == {}
    assert "cavok_conflict" in errors(cavok.replace("CAVOK", "9999 CAVOK"))
    assert "cloud_conflict" in errors(cavok.replace("CAVOK", "CAVOK FEW020"))
    # All conditions of CAVOK met but not used.
    clear = "METAR TGPY 181200Z 08012KT 9999 FEW060 31/24 Q1014="
    assert "warning:cavok_expected" in codes(clear)
    cb = clear.replace("FEW060", "FEW060CB")
    assert "warning:cavok_expected" not in codes(cb)


def test_temperature_group() -> None:
    assert errors(METAR.replace("31/24", "M02/M05")) == set()
    assert "dewpoint_above_air" in errors(METAR.replace("31/24", "24/31"))
    assert "dewpoint_above_air" in errors(METAR.replace("31/24", "M05/M02"))
    assert errors(METAR.replace("31/24", "M00/M00")) == set()


def test_pressure_group() -> None:
    assert "unknown_group" in errors(METAR.replace("Q1014", "1014"))
    assert "warning:qnh_range" in codes(METAR.replace("Q1014", "Q0714"))
    assert errors(METAR.replace("Q1014", "A2992")) == set()


def test_mandatory_groups_and_order() -> None:
    assert "missing_qnh" in errors(METAR.replace(" Q1014", ""))
    assert "missing_temperature" in errors(METAR.replace(" 31/24", ""))
    assert "missing_wind" in errors(METAR.replace("08012KT ", ""))
    assert "missing_visibility" in errors(METAR.replace("9999 ", ""))
    assert "missing_cloud" in errors(METAR.replace(" FEW020 SCT120", ""))
    swapped = "METAR TGPY 181200Z 9999 08012KT FEW020 SCT120 31/24 Q1014="
    assert "group_order" in errors(swapped)
    assert "group_order" in errors(METAR.replace("31/24 Q1014", "Q1014 31/24"))


def test_recent_weather_windshear_and_remarks() -> None:
    assert errors(METAR.replace("NOSIG", "RERA WS RWY10 NOSIG")) == set()
    assert errors(METAR.replace("NOSIG=", "NOSIG RMK FEW SC CIG VAR=")) == set()


def test_trend_forecasts() -> None:
    ok = METAR.replace("NOSIG", "BECMG FM1230 TL1330 BKN010")
    assert errors(ok) == set()
    assert errors(METAR.replace("NOSIG", "TEMPO FM1230 TL1330 4000 -SHRA")) == set()
    assert "trend_period" in errors(METAR.replace("NOSIG", "BECMG TL1500 BKN010"))
    assert "trend_nosig" in errors(METAR.replace("NOSIG", "NOSIG BECMG BKN010"))
    assert "trend_group" in errors(METAR.replace("NOSIG", "BECMG 31/24"))
    assert "trend_time" in errors(METAR.replace("NOSIG", "BECMG TL1300 FM1230 BKN010"))
    assert "trend_empty" in errors(METAR.replace("NOSIG", "BECMG FM1230"))


def test_unknown_group_and_speci_plausibility() -> None:
    assert "unknown_group" in errors(METAR.replace("NOSIG", "6SM"))
    speci = METAR.replace("METAR", "SPECI").replace("1200Z", "1215Z")
    assert "warning:speci_criteria" in codes(speci, "SPECI")
    fine = speci.replace("9999 FEW020 SCT120", "3000 TSRA FEW020CB BKN030")
    assert "warning:speci_criteria" not in codes(fine, "SPECI")


# --- TAF ---------------------------------------------------------------------------


def test_taf_validity_rules() -> None:
    assert "validity" in errors("TAF TGPY 180500Z 08012KT 9999 FEW020=", "TAF")
    assert "validity_length" in errors(TAF.replace("1806/1906", "1806/1809"), "TAF")
    assert "validity_length" in errors(TAF.replace("1806/1906", "1806/2024"), "TAF")
    assert "validity" in errors(TAF.replace("1806/1906", "1806/1925"), "TAF")
    for good in ("1806/1906", "1806/1815", "1806/1912"):
        assert "validity_length" not in errors(TAF.replace("1806/1906", good), "TAF")
    assert "time_mismatch" in errors(
        TAF,
        "TAF",
        valid_from=datetime(2026, 9, 18, 7, tzinfo=UTC),
        valid_to=datetime(2026, 9, 19, 6, tzinfo=UTC),
    )
    assert "time_mismatch" not in errors(
        TAF,
        "TAF",
        issued_at=datetime(2026, 9, 18, 5, tzinfo=UTC),
        valid_from=datetime(2026, 9, 18, 6, tzinfo=UTC),
        valid_to=datetime(2026, 9, 19, 6, tzinfo=UTC),
    )


def test_taf_month_rollover_is_not_a_false_error() -> None:
    message = TAF.replace("180500Z", "300500Z").replace("1806/1906", "3006/0106")
    message = message.replace("1810/1814", "3010/3014").replace(
        "1822/1824", "3022/3024"
    )
    found = errors(message, "TAF", issued_at=datetime(2026, 9, 30, 5, tzinfo=UTC))
    assert found == set()


def test_taf_amend_cancel_and_nil() -> None:
    assert errors("TAF AMD TGPY 181100Z 1812/1912 CNL=", "TAF") == set()
    assert "cnl_content" in errors("TAF AMD TGPY 181100Z 1812/1912 CNL 08012KT=", "TAF")
    assert errors("TAF TGPY 180500Z NIL=", "TAF") == set()
    assert errors(TAF.replace("TAF TGPY", "TAF COR TGPY"), "TAF") == set()


def test_taf_base_forecast_is_complete() -> None:
    assert "missing_wind" in errors(TAF.replace("08012KT ", ""), "TAF")
    assert "missing_visibility" in errors(TAF.replace("9999 ", ""), "TAF")
    assert "missing_cloud" in errors(TAF.replace(" FEW020 SCT120", ""), "TAF")
    assert "taf_group" in errors(TAF.replace("SCT120", "SCT120 Q1014"), "TAF")
    assert "unknown_group" in errors(TAF.replace("SCT120", "SCT120 HELLO"), "TAF")


def test_taf_change_group_periods() -> None:
    assert "change_length" in errors(TAF.replace("1810/1814", "1810/1816"), "TAF")
    assert "change_outside" in errors(TAF.replace("1810/1814", "1804/1808"), "TAF")
    assert "change_period" in errors(TAF.replace("1810/1814", "1814/1810"), "TAF")
    assert "change_period" in errors(
        TAF.replace("TEMPO 1810/1814", "TEMPO 4000"), "TAF"
    )
    assert "change_empty" in errors(TAF.replace("4000 SHRA BKN015CB ", ""), "TAF")


def test_taf_fm_groups() -> None:
    fm = TAF.replace(
        "BECMG 1822/1824 05008KT",
        "FM181800 06010KT 9999 SCT025 FM190200 04005KT 9999 NSC",
    )
    assert errors(fm, "TAF") == set()
    reversed_fm = fm.replace("FM190200", "FM181200")
    assert "fm_order" in errors(reversed_fm, "TAF")
    assert "missing_visibility" in errors(
        fm.replace("06010KT 9999 SCT025", "06010KT SCT025"), "TAF"
    )
    assert "change_outside" in errors(fm.replace("FM190200", "FM192200"), "TAF")


def test_taf_prob_groups() -> None:
    prob = TAF.replace("TEMPO 1810/1814", "PROB30 TEMPO 1810/1814")
    assert errors(prob, "TAF") == set()
    assert errors(TAF.replace("TEMPO 1810/1814", "PROB40 1810/1813"), "TAF") == set()
    assert "prob_becmg" in errors(
        TAF.replace("TEMPO 1810/1814", "PROB30 BECMG 1810/1812"), "TAF"
    )


def test_taf_temperature_groups() -> None:
    with_temps = TAF.replace("SCT120 TEMPO", "SCT120 TX32/1815Z TN24/1909Z TEMPO")
    assert errors(with_temps, "TAF") == set()
    assert "temperature_extremes" in errors(with_temps.replace("TX32", "TX20"), "TAF")
    assert "warning:temperature_order" in codes(
        TAF.replace("SCT120 TEMPO", "SCT120 TN24/1909Z TX32/1815Z TEMPO"), "TAF"
    )


async def test_validate_endpoint_contract() -> None:
    user = User(
        id=uuid4(),
        email="forecaster@example.test",
        is_active=True,
        registration_pending=False,
        is_superuser=True,
    )
    author = ProductAuthor(user=user, allowed_kinds=["aviation"])
    app.dependency_overrides[get_author] = lambda: author
    url = "/api/v1/wxproducts/aviation/drafts/validate"
    body = {"kind": "METAR", "station": "TGPY", "message": METAR}
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            ok = await client.post(url, json=body)
            assert ok.status_code == 200, ok.text
            assert ok.json() == {"valid": True, "issues": []}
            assert ok.headers["cache-control"] == "no-store"
            bad = await client.post(
                url, json={**body, "message": "METAR TGPY 181200Z 00008KT="}
            )
            payload = bad.json()
            assert payload["valid"] is False
            assert {i["code"] for i in payload["issues"]} >= {
                "wind_north",
                "missing_qnh",
            }
            assert payload["issues"][0]["rule"].startswith("WMO-No. 306")
            author.allowed_kinds = ["marine"]
            assert (await client.post(url, json=body)).status_code == 403
    finally:
        app.dependency_overrides.pop(get_author, None)


def test_taf_nsw_only_in_change_groups() -> None:
    assert errors(TAF.replace("4000 SHRA BKN015CB", "9999 NSW FEW020"), "TAF") == set()
    assert "unknown_group" in errors(
        TAF.replace("SCT120 TEMPO", "SCT120 NSW TEMPO"), "TAF"
    )


# --- SPECI trigger comparison (Annex 3 App. 3 2.3) ---------------------------------

PREVIOUS = "METAR TGPY 181200Z 08012KT 9999 FEW020 SCT120 31/24 Q1014 NOSIG="


def speci(body: str, previous: str = PREVIOUS) -> dict[str, str]:
    message = f"SPECI TGPY 181215Z {body} Q1014="
    return codes(message, "SPECI", previous_message=previous)


def test_speci_without_a_previous_report_keeps_the_plausibility_check() -> None:
    found = codes("SPECI TGPY 181215Z 08012KT 9999 FEW020 31/24 Q1014=", "SPECI")
    assert "warning:speci_criteria" in found
    assert "warning:speci_no_change" not in found


@pytest.mark.parametrize(
    "body",
    [
        "18012KT 9999 FEW020 31/24",  # direction change of 100 degrees
        "08025KT 9999 FEW020 31/24",  # mean speed change of 13 kt
        "08016G28KT 9999 FEW020 31/24",  # gust excess up by 12 kt, mean 16
        "08012KT 2500 BR FEW020 31/24",  # visibility through 3000 m
        "08012KT 9999 TSRA FEW020CB 31/24",  # onset of a thunderstorm
        "08012KT 9999 +RA FEW020 31/24",  # onset of heavy precipitation
        "08012KT 9999 FZRA FEW020 31/24",  # freezing precipitation
        "08012KT 9999 BKN012 31/24",  # ceiling through 1500 ft
        "08012KT 9999 FEW020 33/24",  # temperature up 2 degrees
    ],
)
def test_speci_with_a_criterion_against_the_previous_report_is_not_flagged(
    body: str,
) -> None:
    assert "warning:speci_no_change" not in speci(body)


@pytest.mark.parametrize(
    "body",
    [
        "09012KT 9999 FEW020 SCT120 31/24",  # same weather, 10 degrees
        "08016KT 8000 FEW020 32/24",  # small changes, no threshold crossed
        "08012KT 9999 -RA FEW020 31/24",  # light rain is not a criterion
        "08012KT 9999 FEW015 SCT120 31/24",  # low cloud base but no ceiling
    ],
)
def test_speci_without_a_criterion_against_the_previous_report_is_flagged(
    body: str,
) -> None:
    assert "warning:speci_no_change" in speci(body)


def test_speci_direction_change_needs_a_mean_speed_of_10_kt() -> None:
    previous = PREVIOUS.replace("08012KT", "08006KT")
    assert "warning:speci_no_change" in speci("18006KT 9999 FEW020 31/24", previous)
    assert "warning:speci_no_change" not in speci("18010KT 9999 FEW020 31/24", previous)


def test_speci_cavok_counts_as_clear_and_ends_weather() -> None:
    previous = "METAR TGPY 181200Z 08012KT 2000 RA BKN010 31/24 Q1014="
    assert "warning:speci_no_change" not in speci("08012KT CAVOK 31/24", previous)


def test_speci_unreadable_previous_report_is_reported() -> None:
    found = speci("08012KT 9999 FEW020 31/24", previous="NOT A REPORT")
    assert "warning:speci_previous_unreadable" in found
    assert "warning:speci_no_change" not in found


def test_previous_report_is_ignored_for_metar_and_taf() -> None:
    assert codes(METAR, previous_message=PREVIOUS) == {}
    assert codes(TAF, "TAF", previous_message=PREVIOUS) == codes(TAF, "TAF")


def test_speci_previous_message_reaches_the_endpoint_schema() -> None:
    from src.wxproducts.schemas import AviationValidationRequest

    request = AviationValidationRequest(
        kind="SPECI",
        station="TGPY",
        message="SPECI TGPY 181215Z 08012KT 9999 FEW020 31/24 Q1014=",
        previous_message=PREVIOUS,
    )
    assert request.previous_message == PREVIOUS


# --- TAF change-group criteria (Annex 3 App. 5 1.3) ----------------------------------

TAF_BASE = "TAF TGPY 180500Z 1806/1906 08012KT 9999 FEW020"


def taf(changes: str) -> dict[str, str]:
    return codes(f"{TAF_BASE} {changes}=", "TAF")


def test_taf_change_group_with_a_criterion_is_not_flagged() -> None:
    assert "warning:taf_change_criteria" not in taf("TEMPO 1810/1814 4000 SHRA")
    assert "warning:taf_change_criteria" not in taf("BECMG 1810/1812 26012KT")
    assert "warning:taf_change_criteria" not in taf("TEMPO 1810/1814 BKN008")
    assert "warning:taf_change_criteria" not in taf("BECMG 1810/1812 0500 FG")


def test_taf_change_group_without_a_criterion_is_flagged() -> None:
    assert taf("BECMG 1810/1812 06014KT")["warning:taf_change_criteria"] == "BECMG"
    assert "warning:taf_change_criteria" in taf("TEMPO 1810/1814 8000")
    assert "warning:taf_change_criteria" in taf("TEMPO 1810/1814 -RA")
    assert "warning:taf_change_criteria" in taf("PROB30 1810/1814 SCT030")


def test_taf_becmg_updates_the_prevailing_forecast_but_tempo_does_not() -> None:
    after_becmg = taf("BECMG 1810/1812 26012KT TEMPO 1814/1816 24012KT")
    assert after_becmg["warning:taf_change_criteria"] == "TEMPO"
    after_tempo = taf("TEMPO 1810/1814 26012KT BECMG 1816/1818 24012KT")
    # The TEMPO left the prevailing wind at 080, so 240 is a 160 degree change.
    assert "warning:taf_change_criteria" not in after_tempo


def test_taf_fm_group_replaces_the_prevailing_forecast() -> None:
    complete = "FM181200 26012KT 9999 FEW020"
    assert "warning:taf_change_criteria" not in taf(complete)
    assert "warning:taf_change_criteria" in taf("FM181200 08012KT 9999 FEW020")
    follow = taf(f"{complete} BECMG 1814/1816 24012KT")
    assert follow["warning:taf_change_criteria"] == "BECMG"
