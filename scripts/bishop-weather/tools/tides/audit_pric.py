#!/usr/bin/env python3
"""Audit a collected PRIC snapshot and prepare release-separated hourly data."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Iterator, NamedTuple


class Observation(NamedTuple):
    time: datetime
    value_mm: int


FILL_VALUES = {-32767, -32768, 9999, 99999}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path, help="Collected snapshot directory.")
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Directory for audit and canonical derivative files.",
    )
    return parser.parse_args()


def load_hourly(path: Path) -> list[Observation]:
    records: list[Observation] = []
    with path.open(newline="", encoding="utf-8") as stream:
        for line_number, row in enumerate(csv.reader(stream), 1):
            if not row or all(not value.strip() for value in row):
                continue
            if len(row) < 5:
                raise ValueError(f"{path}:{line_number}: expected at least 5 columns")
            year, month, day, hour, value = (int(item.strip()) for item in row[:5])
            timestamp = datetime(year, month, day, hour, tzinfo=UTC)
            records.append(Observation(timestamp, value))
    return records


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def valid(records: list[Observation]) -> list[Observation]:
    return [record for record in records if record.value_mm not in FILL_VALUES]


def gap_ranges(records: list[Observation]) -> list[dict[str, object]]:
    timestamps = sorted({record.time for record in valid(records)})
    gaps: list[dict[str, object]] = []
    for previous, current in zip(timestamps, timestamps[1:]):
        missing = int((current - previous) / timedelta(hours=1)) - 1
        if missing > 0:
            gaps.append(
                {
                    "after_utc": previous.isoformat(),
                    "before_utc": current.isoformat(),
                    "missing_hours": missing,
                }
            )
    return gaps


def audit_series(path: Path, release: str) -> dict[str, object]:
    records = load_hourly(path)
    good = valid(records)
    if not records or not good:
        raise ValueError(f"No usable observations in {path}")
    counts = Counter(record.time for record in records)
    first, last = min(r.time for r in records), max(r.time for r in records)
    expected = int((last - first) / timedelta(hours=1)) + 1
    values = [record.value_mm for record in good]
    gaps = gap_ranges(records)
    by_year: dict[int, list[Observation]] = defaultdict(list)
    for record in records:
        by_year[record.time.year].append(record)
    completeness: list[dict[str, object]] = []
    for year, year_records in sorted(by_year.items()):
        year_start = max(first, datetime(year, 1, 1, tzinfo=UTC))
        year_end = min(last, datetime(year + 1, 1, 1, tzinfo=UTC) - timedelta(hours=1))
        expected_year = int((year_end - year_start) / timedelta(hours=1)) + 1
        distinct_good = len({r.time for r in valid(year_records)})
        completeness.append(
            {
                "year": year,
                "expected_hours_in_covered_period": expected_year,
                "valid_distinct_hours": distinct_good,
                "completeness_percent": round(100 * distinct_good / expected_year, 3),
            }
        )
    return {
        "release": release,
        "path": str(path),
        "sha256": sha256(path),
        "first_utc": first.isoformat(),
        "last_utc": last.isoformat(),
        "row_count": len(records),
        "expected_hour_slots": expected,
        "valid_rows": len(good),
        "fill_or_invalid_rows": len(records) - len(good),
        "duplicate_timestamp_rows": sum(count - 1 for count in counts.values()),
        "distinct_timestamp_count": len(counts),
        "missing_hour_count_between_first_and_last": expected
        - len({r.time for r in good}),
        "gap_count": len(gaps),
        "largest_gap_hours": max((g["missing_hours"] for g in gaps), default=0),
        "gaps": gaps,
        "minimum_mm_station_datum": min(values),
        "maximum_mm_station_datum": max(values),
        "mean_mm_station_datum": round(statistics.fmean(values), 3),
        "median_mm_station_datum": statistics.median(values),
        "annual_completeness": completeness,
    }


def verify_manifest(snapshot: Path) -> dict[str, object]:
    manifest_path = snapshot / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    checks: list[dict[str, object]] = []
    for record in manifest["records"]:
        if record["status"] != "downloaded":
            checks.append(
                {
                    "source_id": record["source_id"],
                    "status": "not_downloaded",
                    "manifest_status": record["status"],
                }
            )
            continue
        path = snapshot / record["relative_path"]
        actual = sha256(path)
        checks.append(
            {
                "source_id": record["source_id"],
                "status": "verified" if actual == record["sha256"] else "mismatch",
                "expected_sha256": record["sha256"],
                "actual_sha256": actual,
                "bytes": path.stat().st_size,
            }
        )
    return {
        "manifest_path": str(manifest_path),
        "verified": sum(item["status"] == "verified" for item in checks),
        "mismatches": sum(item["status"] == "mismatch" for item in checks),
        "not_downloaded": sum(item["status"] == "not_downloaded" for item in checks),
        "checks": checks,
    }


def write_series(
    path: Path,
    records: Iterator[Observation],
    release: str,
    source_id: str,
) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("x", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(
            [
                "timestamp_utc",
                "sea_level_mm_station_datum",
                "release_class",
                "source_artifact_id",
            ]
        )
        for record in records:
            if record.value_mm in FILL_VALUES:
                continue
            writer.writerow(
                [record.time.isoformat().replace("+00:00", "Z"), record.value_mm, release, source_id]
            )
            count += 1
    return count


def comparison(
    rq_records: list[Observation], fast_records: list[Observation]
) -> dict[str, object]:
    rq = {record.time: record.value_mm for record in valid(rq_records)}
    fast = {record.time: record.value_mm for record in valid(fast_records)}
    overlap = sorted(rq.keys() & fast.keys())
    differences = [fast[timestamp] - rq[timestamp] for timestamp in overlap]
    exact = sum(value == 0 for value in differences)
    return {
        "overlap_hours": len(overlap),
        "exact_matches": exact,
        "differing_hours": len(overlap) - exact,
        "maximum_absolute_difference_mm": max(map(abs, differences), default=None),
        "root_mean_square_difference_mm": (
            round(math.sqrt(statistics.fmean(value * value for value in differences)), 3)
            if differences
            else None
        ),
        "rq_last_utc": max(rq).isoformat() if rq else None,
        "fast_last_utc": max(fast).isoformat() if fast else None,
        "provisional_hours_after_rq": sum(timestamp > max(rq) for timestamp in fast)
        if rq
        else len(fast),
    }


def main() -> int:
    args = parse_args()
    snapshot = args.snapshot.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)

    rq_path = snapshot / "uhslc/rq/hourly/h789a.csv"
    fast_path = snapshot / "uhslc/fast/hourly/h789.csv"
    rq_records = load_hourly(rq_path)
    fast_records = load_hourly(fast_path)
    rq_good = sorted(valid(rq_records), key=lambda record: record.time)
    rq_last = max(record.time for record in rq_good)
    provisional = sorted(
        (
            record
            for record in valid(fast_records)
            if record.time > rq_last
        ),
        key=lambda record: record.time,
    )

    derivative_counts = {
        "rq_training_rows": write_series(
            output / "pric-hourly-rq-training.csv",
            iter(rq_good),
            "quality-controlled-research",
            "uhslc-rq-hourly-csv",
        ),
        "provisional_extension_rows": write_series(
            output / "pric-hourly-provisional-extension.csv",
            iter(provisional),
            "fast-delivery-provisional",
            "uhslc-fast-hourly-csv",
        ),
    }
    combined = iter(rq_good + provisional)
    derivative_counts["combined_candidate_rows"] = write_series(
        output / "pric-hourly-combined-candidate.csv",
        combined,
        "mixed-see-source-artifact",
        "uhslc-rq-then-fast-extension",
    )

    audit = {
        "schema_version": "1.0",
        "station": "Prickly Bay (PRIC/789/2272)",
        "generated_utc": datetime.now(UTC).isoformat(),
        "height_reference": (
            "UHSLC station datum. This audit does not convert to chart datum, "
            "national datum, LAT, MSL, or RLR."
        ),
        "manifest_integrity": verify_manifest(snapshot),
        "rq_hourly": audit_series(rq_path, "quality-controlled research"),
        "fast_hourly": audit_series(fast_path, "fast-delivery provisional"),
        "rq_fast_comparison": comparison(rq_records, fast_records),
        "derivatives": derivative_counts,
        "release_warning": (
            "The combined candidate is not an official GMS product. It joins "
            "RQ values to a separately labelled provisional extension only."
        ),
    }
    (output / "audit.json").write_text(
        json.dumps(audit, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(audit["manifest_integrity"], indent=2))
    print(json.dumps(audit["rq_fast_comparison"], indent=2))
    print(f"Audit: {output / 'audit.json'}")
    return 1 if audit["manifest_integrity"]["mismatches"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
