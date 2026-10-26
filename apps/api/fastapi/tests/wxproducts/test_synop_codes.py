"""Forecast choices carry their SYNOP meaning (owner, 23 October 2026)."""

import re
from pathlib import Path

import pytest

from src.wxproducts import forecast_pdf, presentation, synop_codes, validation

PRODUCTS = Path(__file__).resolve().parents[5] / "packages/gms/src/products.ts"


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
    types = re.findall(
        r'\{ label: "([^"]+)", ww: (\d+) \}', _ts_block(source, "WEATHER_TYPES")
    )
    assert {label: int(ww) for label, ww in types} == synop_codes.WEATHER_TYPES
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


def test_form_choices_are_the_coded_ones():
    rules = {rule.key: rule for rule in validation.FIELDS["morning"]}
    assert rules["condition"].options == list(synop_codes.CONDITION_OKTAS)
    assert rules["weatherType"].options == list(synop_codes.WEATHER_TYPES)
    assert rules["rainChance"].options == list(synop_codes.RAIN_CHANCE_BANDS)
    evening = {rule.key for rule in validation.FIELDS["evening"]}
    assert {f"day{d}WeatherType" for d in range(1, 5)} <= evening


def test_oktas_cover_the_sky_once():
    covered = [
        okta
        for low, high in synop_codes.CONDITION_OKTAS.values()
        for okta in range(low, high + 1)
    ]
    assert sorted(covered) == list(range(9))


def test_weather_type_shows_in_words_on_the_sheet_and_day_cards():
    tiles = presentation.conditions({"weatherType": "Thunderstorms"})
    assert tiles[0] == ("cloud-lightning", "Thunderstorms", "Weather type")
    assert synop_codes.weather_icon("Light showers") == "cloud-rain"
    assert synop_codes.weather_icon("Dust haze") == "haze"
    day = forecast_pdf._outlook(
        {"day1Date": "2026-09-25", "day1WeatherType": "Light showers"}
    )[0]
    assert {
        "icon": "cloud-rain",
        "value": "Light showers",
        "label": "Weather type",
    } in day["tiles"]
