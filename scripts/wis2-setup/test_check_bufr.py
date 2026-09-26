from pathlib import Path

import eccodes as ec
import pytest
from check_bufr import DecodedBufr, compare, decode_bufr, read_mapping, read_source

HERE = Path(__file__).parent
SOURCE = HERE / "test-data" / "wmo_data_0-20000-0-78958.csv"
MAPPING = HERE / "Surface-RA-IV-100.json"


def matching_message() -> tuple[dict[str, str], DecodedBufr, int, tuple[int, ...]]:
    row = read_source(SOURCE)
    version, descriptors = read_mapping(MAPPING)
    values: dict[str, str | int | float | None] = {
        "#1#wigosIdentifierSeries": 0,
        "#1#wigosIssuerOfIdentifier": 20000,
        "#1#wigosIssueNumber": 0,
        "#1#wigosLocalIdentifierCharacter": "78958",
        "#1#year": 2026,
        "#1#month": 7,
        "#1#day": 8,
        "#1#hour": 21,
        "#1#minute": 0,
        "#1#latitude": 12.0042,
        "#1#longitude": -61.7862,
        "#1#nonCoordinatePressure": 100950,
        "#1#pressureReducedToMeanSeaLevel": 101100,
        "#1#airTemperature": 302.15,
        "#1#dewpointTemperature": 297.65,
        "#1#relativeHumidity": 76,
        "#1#windDirection": 95,
        "#1#windSpeed": 6.2,
    }
    return row, DecodedBufr(values, 4, version, descriptors, 1), version, descriptors


def test_matching_decoded_values_pass() -> None:
    source, decoded, version, descriptors = matching_message()
    assert (
        compare(source, decoded, table_version=version, descriptors=descriptors) == []
    )


@pytest.mark.parametrize(
    ("key", "wrong", "column"),
    [
        ("#1#wigosLocalIdentifierCharacter", "78959", "wsi_local"),
        ("#1#hour", 20, "hour"),
        ("#1#nonCoordinatePressure", 101950, "station_pressure"),
        ("#1#airTemperature", 303.15, "air_temperature"),
        ("#1#windSpeed", None, "wind_speed"),
    ],
)
def test_mismatches_are_reported(
    key: str, wrong: str | float | None, column: str
) -> None:
    source, decoded, version, descriptors = matching_message()
    decoded.values[key] = wrong
    issues = compare(source, decoded, table_version=version, descriptors=descriptors)
    assert any(issue.startswith(f"{column}:") for issue in issues)


def test_wrong_table_and_descriptors_are_reported() -> None:
    source, decoded, version, _descriptors = matching_message()
    issues = compare(source, decoded, table_version=version + 1, descriptors=(301150,))
    assert any("table version" in issue for issue in issues)
    assert any("descriptors" in issue for issue in issues)


def test_source_must_have_one_observation(tmp_path: Path) -> None:
    source = tmp_path / "empty.csv"
    source.write_text("year,month\n", encoding="utf-8")
    with pytest.raises(ValueError, match="exactly one"):
        read_source(source)


def test_decoder_reads_real_bufr_and_rejects_extra_messages(tmp_path: Path) -> None:
    message = ec.codes_bufr_new_from_samples("BUFR4")
    try:
        ec.codes_set_array(message, "unexpandedDescriptors", [1001])
        ec.codes_set(message, "unpack", 1)
        ec.codes_set(message, "blockNumber", 78)
        ec.codes_set(message, "pack", 1)
        encoded = ec.codes_get_message(message)
    finally:
        ec.codes_release(message)

    path = tmp_path / "sample.bufr4"
    path.write_bytes(encoded)
    decoded = decode_bufr(path)
    assert decoded.edition == 4
    assert decoded.descriptors == (1001,)
    assert decoded.subsets == 1

    path.write_bytes(encoded + encoded)
    with pytest.raises(ValueError, match="more than one"):
        decode_bufr(path)
