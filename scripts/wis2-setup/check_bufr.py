"""Compare a published SURFACE BUFR message with the CSV that produced it.

Run with the existing gms-ingest environment, which already provides ecCodes:
    uv run --frozen --package gms-ingest python scripts/wis2-setup/check_bufr.py \
        --source-csv input.csv --bufr output.bufr4

This checks transfer fidelity for selected fields. It does not certify that
the observation, its QC, or every BUFR descriptor meets WMO requirements.
"""

import argparse
import csv
import json
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path

MAPPING = Path(__file__).with_name("Surface-RA-IV-100.json")

# CSV column, ecCodes key, BUFR resolution tolerance. Units are already SI in
# SURFACE's WMO CSV. Repeated descriptors use their explicit rank.
FIELDS: tuple[tuple[str, str, Decimal], ...] = (
    ("latitude", "#1#latitude", Decimal("0.0001")),
    ("longitude", "#1#longitude", Decimal("0.0001")),
    ("station_pressure", "#1#nonCoordinatePressure", Decimal(1)),
    ("msl_pressure", "#1#pressureReducedToMeanSeaLevel", Decimal(1)),
    ("air_temperature", "#1#airTemperature", Decimal("0.11")),
    ("dewpoint_temperature", "#1#dewpointTemperature", Decimal("0.11")),
    ("relative_humidity", "#1#relativeHumidity", Decimal(1)),
    ("wind_direction", "#1#windDirection", Decimal(1)),
    ("wind_speed", "#1#windSpeed", Decimal("0.11")),
)

IDENTITY: tuple[tuple[str, str], ...] = (
    ("wsi_series", "#1#wigosIdentifierSeries"),
    ("wsi_issuer", "#1#wigosIssuerOfIdentifier"),
    ("wsi_issue_number", "#1#wigosIssueNumber"),
    ("wsi_local", "#1#wigosLocalIdentifierCharacter"),
    ("year", "#1#year"),
    ("month", "#1#month"),
    ("day", "#1#day"),
    ("hour", "#1#hour"),
    ("minute", "#1#minute"),
)


@dataclass(frozen=True)
class DecodedBufr:
    values: dict[str, str | int | float | None]
    edition: int
    table_version: int
    descriptors: tuple[int, ...]
    subsets: int


def read_source(path: Path) -> dict[str, str]:
    with path.open(newline="", encoding="utf-8") as source:
        rows = list(csv.DictReader(source))
    if len(rows) != 1:
        raise ValueError(f"expected exactly one source observation, found {len(rows)}")
    row = rows[0]
    if None in row or any(value is None for value in row.values()):
        raise ValueError("source CSV has an inconsistent number of columns")
    return {key: value for key, value in row.items() if value is not None}


def read_mapping(path: Path) -> tuple[int, tuple[int, ...]]:
    mapping = json.loads(path.read_text(encoding="utf-8"))
    header = {entry["eccodes_key"]: entry["value"] for entry in mapping["header"]}
    version = int(header["masterTablesVersionNumber"].removeprefix("const:"))
    descriptors = tuple(
        int(item)
        for item in header["unexpandedDescriptors"].removeprefix("array:").split(",")
    )
    return version, descriptors


def decode_bufr(path: Path) -> DecodedBufr:
    import eccodes as ec

    keys = {key for _, key in IDENTITY} | {key for _, key, _ in FIELDS}
    with path.open("rb") as source:
        message = ec.codes_bufr_new_from_file(source)
        if message is None:
            raise ValueError("BUFR file contains no message")
        try:
            edition = int(ec.codes_get(message, "edition"))
            table_version = int(ec.codes_get(message, "masterTablesVersionNumber"))
            subsets = int(ec.codes_get(message, "numberOfSubsets"))
            descriptors = tuple(
                int(value)
                for value in ec.codes_get_array(message, "unexpandedDescriptors")
            )
            ec.codes_set(message, "unpack", 1)
            values: dict[str, str | int | float | None] = {}
            for key in keys:
                try:
                    values[key] = (
                        None
                        if ec.codes_is_missing(message, key)
                        else ec.codes_get(message, key)
                    )
                except ec.CodesInternalError:
                    values[key] = None
        finally:
            ec.codes_release(message)
        extra = ec.codes_bufr_new_from_file(source)
        if extra is not None:
            ec.codes_release(extra)
            raise ValueError("expected one BUFR message, found more than one")
    return DecodedBufr(values, edition, table_version, descriptors, subsets)


def compare(
    source: dict[str, str],
    decoded: DecodedBufr,
    *,
    table_version: int,
    descriptors: tuple[int, ...],
) -> list[str]:
    issues: list[str] = []
    if decoded.edition != 4:
        issues.append(f"BUFR edition: expected 4, got {decoded.edition}")
    if decoded.subsets != 1:
        issues.append(f"BUFR subsets: expected 1, got {decoded.subsets}")
    if decoded.table_version != table_version:
        issues.append(
            f"BUFR table version: expected {table_version}, got {decoded.table_version}"
        )
    if decoded.descriptors != descriptors:
        issues.append("BUFR descriptors differ from the configured mapping")

    for column, key in IDENTITY:
        expected = source.get(column, "")
        actual = decoded.values.get(key)
        if column == "wsi_local":
            matches = actual is not None and str(actual).strip() == expected
        else:
            try:
                matches = actual is not None and int(actual) == int(expected)
            except TypeError, ValueError:
                matches = False
        if not expected or not matches:
            issues.append(f"{column}: expected {expected!r}, got {actual!r}")

    compared = 0
    for column, key, tolerance in FIELDS:
        expected_text = source.get(column, "")
        if not expected_text:
            continue
        compared += 1
        actual = decoded.values.get(key)
        try:
            expected = Decimal(expected_text)
            observed = Decimal(str(actual))
            if not observed.is_finite() or abs(observed - expected) > tolerance:
                issues.append(f"{column}: expected {expected}, got {actual!r}")
        except InvalidOperation, TypeError:
            issues.append(f"{column}: expected {expected_text!r}, got {actual!r}")
    if compared == 0:
        issues.append("source observation contains no checked meteorological values")
    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-csv", required=True, type=Path)
    parser.add_argument("--bufr", required=True, type=Path)
    parser.add_argument("--mapping", type=Path, default=MAPPING)
    args = parser.parse_args()
    try:
        source = read_source(args.source_csv)
        version, descriptors = read_mapping(args.mapping)
        decoded = decode_bufr(args.bufr)
        issues = compare(
            source, decoded, table_version=version, descriptors=descriptors
        )
    except (OSError, ValueError) as error:
        issues = [str(error)]
    print(json.dumps({"pass": not issues, "issues": issues}, indent=2))
    return 0 if not issues else 1


if __name__ == "__main__":
    raise SystemExit(main())
