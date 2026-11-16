"""A stored body is the record: reading and encoding it never recalculates a field.

Also the station settings request: all four amounts are required (explicit null
clears one), so a partial or empty PUT cannot wipe amounts.
"""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from src.eregister import derive, encode, rules
from src.eregister.config import Wis2boxConfig
from src.eregister.schemas import StationSettingsUpdate

from .test_eregister_validation import PAPER_ROW

OBSERVED = datetime(2026, 3, 30, 12, 0, tzinfo=UTC)
# Keyed dew point +12.3 C. A wet bulb of 25.0 C at 995.0 hPa calculates another one.
STORED = {
    **PAPER_ROW,
    "air_temp": "0280",
    "wet_bulb": "0250",
    "dew_point": "0123",
    "station_pressure": "9950",
}
AMOUNT_NAMES = (
    "total_correction_hpa",
    "qfe_offset_hpa",
    "sea_level_offset_hpa",
    "qnh_offset_hpa",
)


def test_a_stored_keyed_dew_point_is_encoded_as_keyed() -> None:
    # Guard: the calculation would change the value, so the test shows the difference.
    assert derive.derived_fields(STORED)["dew_point"] != "0123"
    book = encode.workbook_from_body(STORED)
    assert book.dew_point == "0123"
    assert " 20123 " in encode.synop_tac(book)


def test_a_stored_keyed_dew_point_is_sent_in_the_csv_as_keyed() -> None:
    # Same path as sends.py: the stored record is checked as saved, not recalculated.
    book = encode.workbook_from_body(STORED)
    _, decoded = rules.validate_synop(book, recompute=False)
    row = encode.wis2_row(book, decoded, OBSERVED, Wis2boxConfig())
    assert row["dewpoint_temperature"] == "285.45"


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"total_correction_hpa": 0.0},
        {name: 0.0 for name in AMOUNT_NAMES[:3]},
    ],
)
def test_station_settings_update_needs_every_amount(body: dict[str, float]) -> None:
    with pytest.raises(ValidationError):
        StationSettingsUpdate.model_validate(body)


def test_station_settings_update_clears_an_amount_with_an_explicit_null() -> None:
    update = StationSettingsUpdate.model_validate(
        {**dict.fromkeys(AMOUNT_NAMES, 0.3), "qfe_offset_hpa": None}
    )
    assert update.qfe_offset_hpa is None
    assert update.total_correction_hpa == 0.3
