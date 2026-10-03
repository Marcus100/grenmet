import pytest

from src.wxproducts import units, validation
from tests.wxproducts.test_validation import complete


def test_wind_conversions_use_exact_factors():
    assert units.convert_wind(10, "km/h") == pytest.approx(18.52)
    assert units.convert_wind(10, "mph") == pytest.approx(11.5078, abs=1e-4)
    assert units.convert_wind(10, "m/s") == pytest.approx(5.1444, abs=1e-4)
    assert units.feet(1.8) == pytest.approx(5.9055, abs=1e-4)


def test_compass_and_wmo_sea_state_table():
    assert units.degrees("NE") == 45
    assert units.degrees("Variable") is None
    assert [code for code, _, _ in units.SEA_STATES.values()] == list(range(10))
    assert units.SEA_STATES["Moderate"] == (4, 1.25, 2.5)


def test_display_text():
    assert (
        units.wind_text("NE", "E", 10, 20, 30)
        == "NE to E 12–23 mph (10–20 kt), gusts 35 mph (30 kt)"
    )
    assert units.wind_text("E", "", 15, 15, None, unit="kt") == "E 15 kt"
    assert units.height_text(1.8, 2.7) == "1.8–2.7 m (6–9 ft)"
    assert units.sea_state_text("Moderate", "Rough") == "Moderate to rough"
    assert units.swell_text("NE", 9, 1.2) == "NE 1.2 m (4 ft) every 9 s"


def test_normalize_composes_legacy_text_from_structured_values():
    values = validation.normalize(
        "morning",
        {
            "issuedAt": "2026-09-24T07:00",
            "windDirFrom": "NE",
            "windDirTo": "E",
            "windSpeedMin": "10",
            "windSpeedMax": "20",
            "seaStateFrom": "Moderate",
            "waveHeightMin": "1.8",
            "waveHeightMax": "2.7",
            "tide1Type": "Low",
            "tide1Time": "12:30",
            "tide2Type": "High",
            "tide2Time": "05:50",
            "tide2Height": "0.6",
            "tide3Type": "High",
            "tide3Time": "18:10",
        },
    )
    assert values["wind"] == "NE to E 12–23 mph (10–20 kt)"
    assert values["seaState"] == "Moderate; waves 1.8–2.7 m (6–9 ft)"
    assert values["highTides"] == "05:50 (0.6 m), 18:10"
    assert values["lowTides"] == "12:30"


def test_normalize_keeps_legacy_free_text_without_structured_values():
    values = validation.normalize(
        "morning", {"issuedAt": "2026-09-24T07:00", "wind": "E 10-15 kt"}
    )
    assert values["wind"] == "E 10-15 kt"


@pytest.mark.parametrize(
    ("changes", "error"),
    [
        ({"windSpeedMin": "25", "windSpeedMax": "20"}, "'speed from' exceeds"),
        ({"windSpeedMax": "20", "windGust": "15"}, "gusts must be at least"),
        ({"waveHeightMin": "40"}, "waveHeightMin: must be between 0 and 30"),
        ({"waveHeightMin": "3", "waveHeightMax": "2"}, "'wave height from'"),
        ({"seaStateFrom": "Rough", "seaStateTo": "Slight"}, "rougher than"),
        ({"rainChance": "140"}, "rainChance: must be between 0 and 100"),
        ({"tide1Type": "High"}, "Tide 1: choose high or low and enter its time"),
        ({"tide1Type": "High", "tide1Time": "25:00"}, "enter a time as HH:MM"),
    ],
)
def test_parameter_checks(changes, error):
    errors = validation.parameter_errors(complete("morning") | changes)
    field_errors = [
        message
        for rule in validation.FIELDS["morning"]
        for message in (
            [f"{rule.label}: enter a time as HH:MM"]
            if rule.type == "time"
            and (changes.get(rule.key) or "").strip()
            and not validation.TIME_OF_DAY.fullmatch(changes[rule.key])
            else []
        )
    ]
    assert any(error in message for message in errors + field_errors)


def test_evening_days_compose_and_validate_per_day():
    values = complete("evening") | {
        "day2WindDirFrom": "E",
        "day2WindSpeedMin": "15",
        "day2WindSpeedMax": "10",
        "day3Tide1Type": "High",
        "day3Tide1Time": "06:15",
    }
    normalized = validation.normalize("evening", values)
    assert normalized["day2Wind"] == "E 17–12 mph (15–10 kt)"
    assert normalized["day3HighTides"] == "06:15"
    assert normalized["day3LowTides"] == ""
    assert normalized["wind"] != normalized["day2Wind"]
    errors = [
        f"{label}{message}"
        for prefix, label in validation.forecast_periods("evening")
        for message in validation.parameter_errors(
            validation.period_values(normalized, prefix)
        )
    ]
    assert "Day 2: Wind: 'speed from' exceeds 'speed to'" in errors


def test_visibility_in_km_with_nautical_miles_and_marine_terms():
    assert units.visibility_text(5, 10) == "5–10 km (2.7–5.4 nmi), moderate to good"
    assert units.visibility_text(0.5, None) == "0.5 km (0.3 nmi), very poor"
    values = validation.normalize(
        "marine", complete("marine") | {"visibilityMin": "12"}
    )
    assert values["visibility"] == "12 km (6.5 nmi), good"
    errors = validation.parameter_errors({"visibilityMin": "9", "visibilityMax": "4"})
    assert "Visibility: 'from' exceeds 'to'" in errors
