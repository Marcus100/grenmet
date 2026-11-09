"""IWXXM 2025-2 METAR and SPECI built from an accepted eRegister observation.

Golden cases are realistic Grenada (MBIA, 78958) hourly observations. Each is built
from the coded workbook, decoded to SI values and checked against the XML the
encoder must produce, then validated against the vendored WMO/ICAO XSD bundle.
"""

import re
import xml.etree.ElementTree as ET
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from defusedxml import ElementTree as safe_et

from src.eregister import aerodromes, derive, iwxxm

OBSERVED = datetime(2026, 3, 30, 12, 0, tzinfo=UTC)
# Owner-confirmed 78958 pressure amounts (eregister AGENTS: QFE +0.3, sea level +1.0, QNH +0.1).
STATION_78958 = derive.PressureSettings(
    total_correction_hpa=0.0,
    qfe_offset_hpa=0.3,
    sea_level_offset_hpa=1.0,
    qnh_offset_hpa=0.1,
)
XLINK = "http://www.w3.org/1999/xlink"
NS = {
    "iwxxm": iwxxm.IWXXM_NAMESPACE,
    "gml": "http://www.opengis.net/gml/3.2",
    "aixm": "http://www.aixm.aero/schema/5.1.1",
    "xlink": XLINK,
}
NIL_MISSING = "http://codes.wmo.int/common/nil/missing"
NIL_NOTHING = "http://codes.wmo.int/common/nil/nothingOfOperationalSignificance"

# A dry, calm hour: 25.4 C air, 21.3 C dew point, MSL 1016.3 hPa (QNH 1016), 5 km.
BASE = {
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
NIL_ROW = {
    key: BASE[key]
    for key in (
        "report_type",
        "day",
        "time_utc",
        "station_id",
        "wind_indicator",
        "source",
    )
}


def record(
    changes: dict[str, Any] | None = None,
    *,
    aerodrome: str = "TGPY",
    correction: bool = False,
    kind: iwxxm.ReportKind = "METAR",
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    values = {**BASE, **(changes or {})} if body is None else body
    return iwxxm.record_for_row(
        body=values,
        station=STATION_78958,
        observed_at=OBSERVED,
        aerodrome_icao=aerodrome,
        correction=correction,
        kind=kind,
    )


def parse(stored: dict[str, Any]) -> ET.Element:
    assert stored["xml"] is not None
    return safe_et.fromstring(stored["xml"])


def find(root: ET.Element, path: str) -> ET.Element | None:
    return root.find(path, NS)


def text_of(root: ET.Element, path: str) -> str | None:
    element = find(root, path)
    return None if element is None else element.text


def href_of(root: ET.Element, path: str) -> str | None:
    element = find(root, path)
    return None if element is None else element.get(f"{{{XLINK}}}href")


def assert_valid(stored: dict[str, Any]) -> None:
    assert stored["valid"] is True, stored["errors"]
    assert stored["errors"] == []
    assert stored["schematron"] == "not_run"
    assert iwxxm.schema_errors(stored["xml"]) == []


# --- pinned version and reference data --------------------------------------


def test_version_is_pinned_and_the_vendored_entry_point_exists() -> None:
    assert iwxxm.IWXXM_VERSION == "2025-2"
    assert iwxxm.IWXXM_NAMESPACE == "http://icao.int/iwxxm/2025-2"
    assert iwxxm.SCHEMA_ENTRY.is_file()


def test_aerodrome_reference_for_the_two_grenada_aerodromes() -> None:
    mbia = aerodromes.get("TGPY")
    lauriston = aerodromes.get("TGPZ")
    assert mbia is not None and lauriston is not None
    assert mbia.name == "MAURICE BISHOP INTERNATIONAL AIRPORT"
    assert lauriston.name == "LAURISTON AIRPORT"
    # Metres above mean sea level (41 ft and 5 ft in the public sources).
    assert round(mbia.elevation_m, 1) == 12.5
    assert round(lauriston.elevation_m, 1) == 1.5
    assert mbia.vertical_datum == "EGM_96"
    assert 12.0 < mbia.latitude < 12.1 and -61.8 < mbia.longitude < -61.7
    assert 12.4 < lauriston.latitude < 12.5 and -61.5 < lauriston.longitude < -61.4
    assert aerodromes.get("EGLL") is None


# --- golden METARs ------------------------------------------------------------


def test_calm_clear_hour_golden_values() -> None:
    stored = record()
    assert_valid(stored)
    root = parse(stored)
    assert root.tag == f"{{{iwxxm.IWXXM_NAMESPACE}}}METAR"
    assert root.get("reportStatus") == "NORMAL"
    assert root.get("permissibleUsage") == "OPERATIONAL"
    assert root.get("automatedStation") == "false"
    assert text_of(root, "iwxxm:issueTime/gml:TimeInstant/gml:timePosition") == (
        "2026-03-30T12:00:00Z"
    )
    assert text_of(root, "iwxxm:observationTime/gml:TimeInstant/gml:timePosition") == (
        "2026-03-30T12:00:00Z"
    )
    assert text_of(root, ".//aixm:designator") == "TGPY"
    assert text_of(root, ".//aixm:locationIndicatorICAO") == "TGPY"
    wind = find(root, ".//iwxxm:AerodromeSurfaceWind")
    assert wind is not None and wind.get("variableWindDirection") == "false"
    direction = find(wind, "iwxxm:meanWindDirection")
    speed = find(wind, "iwxxm:meanWindSpeed")
    assert direction is not None and direction.text == "0"
    assert direction.get("uom") == "deg"
    assert speed is not None and speed.text == "0"
    assert speed.get("uom") == "[kn_i]"
    assert text_of(root, ".//iwxxm:prevailingVisibility") == "5000"
    assert find(root, ".//iwxxm:presentWeather") is None
    cloud = find(root, ".//iwxxm:cloud")
    assert cloud is not None and cloud.get("nilReason") == NIL_NOTHING
    assert text_of(root, ".//iwxxm:airTemperature") == "25.4"
    assert text_of(root, ".//iwxxm:dewpointTemperature") == "21.3"
    assert text_of(root, ".//iwxxm:qnh") == "1016"


def test_variable_wind_has_no_mean_direction() -> None:
    stored = record({"wind_dir": "99", "wind_speed": "04"})
    assert_valid(stored)
    wind = find(parse(stored), ".//iwxxm:AerodromeSurfaceWind")
    assert wind is not None and wind.get("variableWindDirection") == "true"
    assert find(wind, "iwxxm:meanWindDirection") is None
    assert text_of(wind, "iwxxm:meanWindSpeed") == "4"


def test_gusts_are_reported_when_ten_knots_above_the_mean() -> None:
    stored = record({"wind_dir": "24", "wind_speed": "15", "wind_gust": "25"})
    assert_valid(stored)
    wind = find(parse(stored), ".//iwxxm:AerodromeSurfaceWind")
    assert wind is not None
    assert text_of(wind, "iwxxm:meanWindDirection") == "240"
    assert text_of(wind, "iwxxm:meanWindSpeed") == "15"
    gust = find(wind, "iwxxm:windGustSpeed")
    assert gust is not None and gust.text == "25" and gust.get("uom") == "[kn_i]"


@pytest.mark.parametrize(
    ("ww", "token"),
    [
        ("05", "HZ"),
        ("10", "BR"),
        ("45", "FG"),
        ("17", "TS"),
        ("51", "-DZ"),
        ("63", "RA"),
        ("65", "+RA"),
        ("80", "-SHRA"),
        ("81", "SHRA"),
        ("86", "SHSN"),
    ],
)
def test_present_weather_maps_to_metar_tokens(ww: str, token: str) -> None:
    stored = record({"present_wx": ww, "visibility": "40"})
    assert_valid(stored)
    weather = href_of(parse(stored), ".//iwxxm:presentWeather")
    assert weather == f"http://codes.wmo.int/306/4678/{token}"


def test_thunderstorm_with_rain_and_cumulonimbus_cloud() -> None:
    stored = record(
        {
            "present_wx": "95",
            "visibility": "30",
            "total_cloud": "6",
            "s3_layer1_amount": "6",
            "s3_layer1_form": "9",
            "s3_layer1_height": "10",
        }
    )
    assert_valid(stored)
    root = parse(stored)
    assert (
        href_of(root, ".//iwxxm:presentWeather") == "http://codes.wmo.int/306/4678/TSRA"
    )
    layer = find(root, ".//iwxxm:CloudLayer")
    assert layer is not None
    assert href_of(layer, "iwxxm:amount") == (
        "http://codes.wmo.int/49-2/CloudAmountReportedAtAerodrome/BKN"
    )
    base = find(layer, "iwxxm:base")
    assert base is not None and base.text == "1000" and base.get("uom") == "[ft_i]"
    assert href_of(layer, "iwxxm:cloudType") == (
        "http://codes.wmo.int/49-2/SigConvectiveCloudType/CB"
    )


def test_cavok_sets_cloud_and_visibility_ok_and_leaves_out_cloud() -> None:
    stored = record({"visibility": "60", "total_cloud": "0"})
    assert_valid(stored)
    root = parse(stored)
    observation = find(root, ".//iwxxm:MeteorologicalAerodromeObservation")
    assert observation is not None and observation.get("cloudAndVisibilityOK") == "true"
    assert find(root, ".//iwxxm:cloud") is None
    assert find(root, ".//iwxxm:presentWeather") is None
    assert text_of(root, ".//iwxxm:prevailingVisibility") == "10000"
    assert text_of(root, ".//iwxxm:prevailingVisibilityOperator") == "ABOVE"


def test_nil_report_has_no_observation_content() -> None:
    stored = record(body=NIL_ROW)
    assert_valid(stored)
    observation = find(parse(stored), "iwxxm:observation")
    assert observation is not None
    assert observation.get("nilReason") == NIL_MISSING
    assert len(list(observation)) == 0


def test_correction_of_an_earlier_observation_is_a_cor() -> None:
    stored = record(correction=True)
    assert_valid(stored)
    assert parse(stored).get("reportStatus") == "CORRECTION"


def test_speci_uses_the_speci_root_element() -> None:
    stored = record(kind="SPECI")
    assert_valid(stored)
    assert parse(stored).tag == f"{{{iwxxm.IWXXM_NAMESPACE}}}SPECI"


# --- gaps stay visible and the XML stays schema-valid ------------------------------


def test_unmapped_present_weather_is_an_error_not_a_dropped_group() -> None:
    stored = record({"present_wx": "06"})
    assert stored["valid"] is False
    assert any("ww 06" in error for error in stored["errors"]), stored["errors"]
    assert stored["xml"] is not None
    assert find(parse(stored), ".//iwxxm:presentWeather") is None
    assert iwxxm.schema_errors(stored["xml"]) == []


def test_missing_wind_is_reported_with_a_nil_reason() -> None:
    stored = record({"wind_dir": None, "wind_speed": None})
    assert stored["valid"] is False
    assert any("wind" in error.lower() for error in stored["errors"]), stored["errors"]
    surface = find(
        parse(stored),
        "iwxxm:observation/iwxxm:MeteorologicalAerodromeObservation/iwxxm:surfaceWind",
    )
    assert surface is not None and surface.get("nilReason") == NIL_MISSING
    assert iwxxm.schema_errors(stored["xml"]) == []


def test_unknown_aerodrome_gives_no_xml_and_says_why() -> None:
    stored = record(aerodrome="EGLL")
    assert stored["xml"] is None
    assert stored["valid"] is False
    assert any("EGLL" in error for error in stored["errors"])


# --- validation and codelists ----------------------------------------------------


def test_schema_validation_rejects_a_document_that_is_not_iwxxm() -> None:
    errors = iwxxm.schema_errors(
        f'<iwxxm:METAR xmlns:iwxxm="{iwxxm.IWXXM_NAMESPACE}"/>'
    )
    assert errors, "a METAR with no issue time, aerodrome or observation must fail"


def _golden_xml() -> Iterator[str]:
    yield record()["xml"]
    yield record({"present_wx": "51", "visibility": "40"})["xml"]
    yield record({"present_wx": "80", "visibility": "40"})["xml"]
    yield record(
        {
            "present_wx": "95",
            "visibility": "30",
            "total_cloud": "6",
            "s3_layer1_amount": "6",
            "s3_layer1_form": "9",
            "s3_layer1_height": "10",
        }
    )["xml"]
    yield record({"present_wx": "05", "visibility": "50"})["xml"]
    yield record({"visibility": "60"})["xml"]


def _codelist_members(filename: str) -> set[str]:
    text = (iwxxm.SCHEMA_DIR / "IWXXM" / "rule" / filename).read_text(encoding="utf-8")
    return set(re.findall(r'rdf:about="([^"]+)"', text))


@pytest.mark.parametrize(
    ("file", "prefix"),
    [
        (
            "codes.wmo.int-49-2-AerodromePresentOrForecastWeather.rdf",
            "http://codes.wmo.int/306/4678/",
        ),
        (
            "codes.wmo.int-49-2-CloudAmountReportedAtAerodrome.rdf",
            "http://codes.wmo.int/49-2/CloudAmountReportedAtAerodrome/",
        ),
        (
            "codes.wmo.int-49-2-SigConvectiveCloudType.rdf",
            "http://codes.wmo.int/49-2/SigConvectiveCloudType/",
        ),
    ],
)
def test_every_href_the_encoder_emits_is_in_the_wmo_codelist(
    file: str, prefix: str
) -> None:
    members = _codelist_members(file)
    emitted = {
        element.get(f"{{{XLINK}}}href")
        for xml_text in _golden_xml()
        for element in safe_et.fromstring(xml_text).iter()
        if (element.get(f"{{{XLINK}}}href") or "").startswith(prefix)
    }
    assert emitted, f"no {prefix} tokens emitted by the golden cases"
    missing = sorted(href for href in emitted if href not in members)
    assert missing == [], missing


def test_every_mapped_present_weather_token_is_in_the_wmo_codelist() -> None:
    members = _codelist_members(
        "codes.wmo.int-49-2-AerodromePresentOrForecastWeather.rdf"
    )
    missing = sorted(
        token
        for token in set(iwxxm.PRESENT_WEATHER.values())
        if f"http://codes.wmo.int/306/4678/{token}" not in members
    )
    assert missing == [], missing
