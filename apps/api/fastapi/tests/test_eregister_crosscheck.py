"""Cross-check eregister.encode and rules.validate_synop against an independent decoder.

pymetdecoder (British Antarctic Survey / WMO-IM fork) decodes the TAC the
register emits. Agreement on the shared elements shows the keyed groups, the
FM 12 text and our own SI decode describe the same observation.
"""

from typing import Any

import pytest
from pymetdecoder import synop

from src.eregister import encode, rules
from src.eregister.schemas import SynopDecoded
from tests.test_eregister_send import workbook

KNOT_MS = 1852 / 3600


def _both(**changes: str) -> tuple[dict[str, Any], SynopDecoded]:
    book = workbook(**changes)
    _, decoded = rules.validate_synop(book)
    return synop.SYNOP().decode(encode.synop_tac(book)), decoded


def test_independent_decoder_agrees_with_the_register_decode() -> None:
    other, ours = _both()
    assert ours.air_temperature_k == pytest.approx(
        other["air_temperature"]["value"] + 273.15
    )
    assert ours.dew_point_k == pytest.approx(
        other["dewpoint_temperature"]["value"] + 273.15
    )
    assert ours.station_pressure_pa == pytest.approx(
        other["station_pressure"]["value"] * 100
    )
    assert ours.mean_sea_level_pressure_pa == pytest.approx(
        other["sea_level_pressure"]["value"] * 100
    )
    assert ours.wind_direction_deg == other["surface_wind"]["direction"]["value"]
    assert other["wind_indicator"]["unit"] == "KT"
    # The register stores wind speed to 0.1 m/s, so allow that rounding.
    assert ours.wind_speed_ms == pytest.approx(
        other["surface_wind"]["speed"]["value"] * KNOT_MS, abs=0.05
    )
    assert ours.visibility_m == pytest.approx(other["visibility"]["value"])
    assert ours.max_temperature_k == pytest.approx(
        other["maximum_temperature"]["value"] + 273.15
    )
    assert ours.min_temperature_k == pytest.approx(
        other["minimum_temperature"]["value"] + 273.15
    )
    assert ours.pressure_change_24h_pa == pytest.approx(
        other["pressure_change"]["value"] * 100
    )
    assert ours.rainfall_24h_kg_m2 == pytest.approx(
        other["precipitation_24h"]["amount"]["value"]
    )


def test_independent_decoder_reads_a_negative_temperature_sign() -> None:
    other, ours = _both(air_temp="1034", dew_point="1050")
    assert other["air_temperature"]["value"] == pytest.approx(-3.4)
    assert ours.air_temperature_k == pytest.approx(273.15 - 3.4)
    assert other["dewpoint_temperature"]["value"] == pytest.approx(-5.0)


def test_independent_decoder_reads_a_rising_24h_pressure_change() -> None:
    other, ours = _both(s3_baro_change_24h="8004")
    assert other["pressure_change"]["value"] == pytest.approx(0.4)
    assert ours.pressure_change_24h_pa == pytest.approx(40)
