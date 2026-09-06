from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal

from sutron_collector.exporter import (
    STATION_TZ,
    asc_filename,
    render_asc,
    scale_value,
)
from sutron_collector.models import CollectedBatch, Observation


def observation(tag: str, value: str, *, status: str = "G") -> Observation:
    return Observation(
        tag=tag,
        value=Decimal(value),
        status_tokens=(status, "OK"),
        raw_line=f"{tag} {value} {status} OK",
    )


def batch(*observations: Observation, at: datetime | None = None) -> CollectedBatch:
    return CollectedBatch(
        station_name="MAURICEBISHOPINTL",
        station_id=13000,
        collected_at=at or datetime(2026, 8, 15, 14, 6, tzinfo=UTC),
        observations=observations,
    )


# --- scaling -----------------------------------------------------------------


def test_scale_value_multiplies_and_drops_the_decimal_point() -> None:
    assert scale_value(Decimal("20.7"), 100) == "2070"
    assert scale_value(Decimal("1011.0"), 100) == "101100"
    assert scale_value(Decimal("0.0"), 100) == "0"


def test_scale_value_is_exact_where_legacy_loses_a_hundredth() -> None:
    """Decimal arithmetic avoids the legacy float truncation bug.

    Legacy computed int(float("78.1") * 100). In binary floating point that
    product is 7809.999999999999, and truncation turns it into 7809 -- so the
    regional centre received 78.09 where the station reported 78.1.
    """
    assert scale_value(Decimal("78.1"), 100) == "7810"
    assert int(float("78.1") * 100) == 7809  # the legacy result, for contrast


def test_scale_value_can_reproduce_the_legacy_bug_on_request() -> None:
    """Byte-comparing against real .asc files needs the legacy behaviour."""
    assert scale_value(Decimal("78.1"), 100, legacy_float=True) == "7809"
    assert scale_value(Decimal("20.7"), 100, legacy_float=True) == "2070"


def test_scale_value_handles_negative_readings() -> None:
    assert scale_value(Decimal("-5"), 100) == "-500"


# --- rendering ---------------------------------------------------------------


def test_render_asc_writes_the_cimh_header_and_data_rows() -> None:
    text = render_asc(batch(observation("WSA", "20.7"), observation("AT", "29.5")))
    header, data = text.splitlines()[0], text.splitlines()[1]

    assert header.startswith("gg mm aa hh nn ")
    assert "MAURICEBISHOPINTL.WSA" in header
    assert "MAURICEBISHOPINTL.AT" in header
    # 14:06 UTC is 10:06 in Grenada; the file carries local time as legacy did.
    assert data.startswith("15 08 26 10 06 ")
    assert "2070" in data
    assert "2950" in data


def test_render_asc_right_aligns_values_under_their_headers() -> None:
    """Each value column is as wide as its header token, so columns line up."""
    text = render_asc(batch(observation("WSA", "20.7")))
    header, data = text.splitlines()[0], text.splitlines()[1]

    name = "MAURICEBISHOPINTL.WSA"
    assert header == f"gg mm aa hh nn {name} "
    # 15 chars of date prefix, then the value right-aligned in len(name).
    assert data == "15 08 26 10 06 " + "2070".rjust(len(name)) + " "


def test_render_asc_degrades_gracefully_when_a_value_outgrows_its_column() -> None:
    """An over-long value widens its column instead of being truncated.

    Real readings are far shorter than their column names, so this never
    arises in practice. It matters only that the exporter cannot crash or
    silently drop digits: keeping the value and losing the alignment is the
    safe direction to fail.
    """
    text = render_asc(batch(observation("X", "123456789012345678.9")))
    data = text.splitlines()[1]

    assert "12345678901234567890" in data
    assert not data.endswith("  12345678901234567890 ")


def test_render_asc_ends_with_three_newlines() -> None:
    text = render_asc(batch(observation("AT", "29.5")))
    assert text.endswith("\n\n\n")
    assert not text.endswith("\n\n\n\n")


def test_render_asc_omits_absent_sensors_entirely() -> None:
    """A missing sensor produces no column, exactly as legacy behaved.

    This is why the ingester matches columns by name rather than position:
    the column set changes when sensors are removed or fail.
    """
    text = render_asc(batch(observation("AT", "29.5")))
    header = text.splitlines()[0]

    assert "MAURICEBISHOPINTL.AT" in header
    assert "VWC" not in header
    assert "LW" not in header


def test_render_asc_excludes_quality_flags() -> None:
    """The .asc carries values only -- adding columns would break the contract.

    Flags are retained in our own storage; they have never been part of the
    file CIMH receives.
    """
    text = render_asc(batch(observation("BATTERY", "0.0", status="B")))

    assert " B " not in text
    assert "OK" not in text


# --- filenames ---------------------------------------------------------------


def test_asc_filename_uses_local_date_and_time() -> None:
    at = datetime(2026, 8, 15, 14, 6, tzinfo=UTC)
    assert asc_filename(at) == "20260815_1006.asc"


def test_asc_filename_rolls_the_date_back_across_midnight_utc() -> None:
    """00:30 UTC is still the previous evening in Grenada."""
    at = datetime(2026, 8, 15, 0, 30, tzinfo=UTC)
    assert asc_filename(at) == "20260814_2030.asc"


def test_station_timezone_is_atlantic_standard_time() -> None:
    """Grenada is UTC-4 all year; there is no daylight saving to handle."""
    assert STATION_TZ.utcoffset(None) == timedelta(hours=-4)
    assert STATION_TZ == timezone(timedelta(hours=-4))
