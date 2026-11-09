"""Forecast choices carry their SYNOP meaning (owner, 23 October 2026; #1197)."""

import re
from pathlib import Path

import pytest

from src.wxproducts import forecast_pdf, presentation, synop_codes, validation

PACKAGE = Path(__file__).resolve().parents[5] / "packages/gms/src"
PRODUCTS = PACKAGE / "products.ts"
WEATHER_TYPES = PACKAGE / "weather-types.ts"
PHENOMENON = re.compile(
    r'\{\s*id: "([^"]+)",\s*label: "([^"]+)",\s*phrase: "([^"]+)",'
    r"\s*ww: \[([\d, ]*)\],\s*metar: \[([^\]]*)\],\s*coverage: (\w+|\[\]),?\s*\}"
)


def _ts_block(source: str, name: str) -> str:
    match = re.search(
        rf"export const {name}\b[^=]*= ([\[{{].*?[\]}}])( as const)?;", source, re.S
    )
    assert match, f"{name} missing from products.ts"
    return match.group(1)


def test_tables_match_the_web_definitions():
    if not PRODUCTS.exists():
        pytest.skip("monorepo packages not mounted (API-only container)")
    source = PRODUCTS.read_text()
    oktas = re.findall(
        r'"?([A-Za-z ]+)"?: \[(\d+), (\d+)\]', _ts_block(source, "CONDITION_OKTAS")
    )
    assert {k.strip(): (int(a), int(b)) for k, a, b in oktas} == (
        synop_codes.CONDITION_OKTAS
    )
    bands = re.findall(
        r"(\w+): \[(\d+), (\d+)\]", _ts_block(source, "RAIN_CHANCE_BANDS")
    )
    assert {k: (int(a), int(b)) for k, a, b in bands} == synop_codes.RAIN_CHANCE_BANDS


def test_weather_phenomena_match_the_shared_table():
    if not WEATHER_TYPES.exists():
        pytest.skip("monorepo packages not mounted (API-only container)")
    source = WEATHER_TYPES.read_text()
    groups = {
        "CONVECTIVE": ("isolated", "scattered", "numerous"),
        "STEADY": ("occasional", "periods"),
        "[]": (),
    }
    parsed = {
        key: synop_codes.Phenomenon(
            label,
            phrase,
            tuple(int(code) for code in ww.split(",") if code.strip()),
            tuple(re.findall(r'"([^"]+)"', metar)),
            groups[coverage],
        )
        for key, label, phrase, ww, metar, coverage in PHENOMENON.findall(source)
    }
    assert parsed == synop_codes.WEATHER_PHENOMENA
    legacy = {
        label.strip(): key
        for label, key in re.findall(
            r'"?([A-Za-z() ]+?)"?: "([a-z-]+)"',
            _ts_block(source, "LEGACY_WEATHER_TYPES"),
        )
    }
    assert legacy == synop_codes.LEGACY_WEATHER_TYPES
    coverage = dict(
        re.findall(r'(\w+): "([^"]+)"', _ts_block(source, "WEATHER_COVERAGE"))
    )
    assert coverage == synop_codes.WEATHER_COVERAGE


def test_form_choices_are_the_coded_ones():
    rules = {rule.key: rule for rule in validation.FIELDS["morning"]}
    assert rules["condition"].options == list(synop_codes.CONDITION_OKTAS)
    assert rules["weatherType"].type == "weather"
    assert rules["rainChance"].options == list(synop_codes.RAIN_CHANCE_BANDS)
    evening = {rule.key for rule in validation.FIELDS["evening"]}
    assert {f"day{d}WeatherType" for d in range(1, 5)} <= evening
    assert {f"day{d}WeatherTypeText" for d in range(1, 5)} <= evening


def test_oktas_cover_the_sky_once():
    covered = [
        okta
        for low, high in synop_codes.CONDITION_OKTAS.values()
        for okta in range(low, high + 1)
    ]
    assert sorted(covered) == list(range(9))


def test_weather_items_parse_format_and_map_to_codes():
    value = "showers-light:scattered,saharan-dust,thunderstorms:isolated"
    assert synop_codes.parse_weather(value) == [
        ("saharan-dust", ""),
        ("showers-light", "scattered"),
        ("thunderstorms", "isolated"),
    ]
    assert synop_codes.weather_sentence(value) == (
        "Saharan dust haze, scattered light showers and isolated thunderstorms."
    )
    ww, metar = synop_codes.weather_codes(value)
    assert ww == [6, 17, 80, 95, 97]
    assert metar == ["DU", "HZ", "-SHRA", "TS", "TSRA"]
    assert synop_codes.is_valid_weather(value)
    assert not synop_codes.is_valid_weather("haze:scattered")
    assert not synop_codes.is_valid_weather("snow")
    # Coverage words only where they fit; a stray one is dropped on parse.
    assert synop_codes.parse_weather("haze:numerous") == [("haze", "")]
    assert synop_codes.weather_icon("fair") == "sun"


def test_legacy_single_weather_type_still_reads_and_is_upgraded_on_save():
    assert synop_codes.parse_weather("Light showers") == [("showers-light", "")]
    assert synop_codes.is_valid_weather("Moderate or heavy showers")
    normalized = validation.normalize("midday", {"weatherType": "Light showers"})
    assert normalized["weatherType"] == "showers-light"
    assert normalized["weatherTypeText"] == "Light showers."


def test_reworded_weather_sentence_is_kept():
    normalized = validation.normalize(
        "morning",
        {"weatherType": "haze", "weatherTypeText": "Hazy skies over the islands."},
    )
    assert normalized["weatherTypeText"] == "Hazy skies over the islands."


def test_weather_type_shows_in_words_on_the_sheet_and_day_cards():
    # A revision saved before the multi-select prints as it was stored.
    tiles = presentation.conditions({"weatherType": "Thunderstorms"})
    assert tiles[0] == ("cloud-lightning", "Thunderstorms", "Weather type")
    tiles = presentation.conditions({"weatherType": "showers-light:scattered"})
    assert tiles[0] == ("cloud-rain", "Scattered light showers.", "Weather type")
    day = forecast_pdf._outlook(
        {"day1Date": "2026-09-25", "day1WeatherType": "Light showers"}
    )[0]
    assert {
        "icon": "cloud-rain",
        "value": "Light showers",
        "label": "Weather type",
    } in day["tiles"]
