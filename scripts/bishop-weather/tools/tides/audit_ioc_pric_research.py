#!/usr/bin/env python3
"""Audit archived IOC SLSMF research pages for PRIC without changing raw data."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path


FLAGS = (
    "missing",
    "out_of_range",
    "spikes_via_median",
    "exceeded_neighbours",
    "flat_line",
    "distinctness",
    "completeness",
    "shift",
)
EXPECTED_INTERVAL_SECONDS = {"rad": 60, "prs": 60, "bub": 300}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def parse_time(value: object) -> datetime:
    if not isinstance(value, str):
        raise ValueError(f"stime is not a string: {value!r}")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def percentile(sorted_values: list[float], probability: float) -> float | None:
    if not sorted_values:
        return None
    position = probability * (len(sorted_values) - 1)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_values[lower]
    weight = position - lower
    return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight


def audit_sensor(sensor_dir: Path) -> dict[str, object]:
    sensor = sensor_dir.name
    expected_interval = EXPECTED_INTERVAL_SECONDS.get(sensor)
    pages = sorted(sensor_dir.glob("page-*.json"))
    staging = sorted(sensor_dir.glob("page-*.json.part"))
    flag_true = Counter({flag: 0 for flag in FLAGS})
    flag_invalid = Counter({flag: 0 for flag in FLAGS})
    delta_counts: Counter[float] = Counter()
    numeric_values: list[float] = []
    clean_values: list[float] = []
    page_reports: list[dict[str, object]] = []
    timestamp_count = 0
    duplicate_timestamps = 0
    nonmonotonic_timestamps = 0
    sensor_mismatches = 0
    schema_errors = 0
    qc_unavailable_rows = 0
    null_levels = 0
    previous_last_time: datetime | None = None
    first_time: datetime | None = None
    last_time: datetime | None = None
    seen_times: set[datetime] = set()
    total_pages_values: set[int] = set()
    total_days_values: set[int] = set()
    pagination_missing_pages = 0

    for path in pages:
        with path.open(encoding="utf-8") as stream:
            payload = json.load(stream)
        rows = payload.get("data") if isinstance(payload, dict) else None
        pagination = payload.get("pagination") if isinstance(payload, dict) else None
        if not isinstance(rows, list):
            schema_errors += 1
            page_reports.append(
                {
                    "file": path.name,
                    "sha256": sha256(path),
                    "bytes": path.stat().st_size,
                    "schema_valid": False,
                }
            )
            continue
        page_number = int(path.stem.split("-")[-1])
        if isinstance(pagination, dict):
            total_pages_values.add(int(pagination.get("total_pages", 0)))
            total_days_values.add(int(pagination.get("total_days", 0)))
            page_schema_valid = pagination.get("current_page") == page_number
            if not page_schema_valid:
                schema_errors += 1
        else:
            pagination_missing_pages += 1
            page_schema_valid = True
        page_first: datetime | None = None
        page_last: datetime | None = None
        for row in rows:
            if not isinstance(row, dict):
                schema_errors += 1
                continue
            required = {"slevel", "stime", "sensor", *FLAGS}
            if not required.issubset(row):
                core = {"slevel", "stime", "sensor"}
                if core.issubset(row):
                    qc_unavailable_rows += 1
                else:
                    schema_errors += 1
                continue
            timestamp = parse_time(row["stime"])
            timestamp_count += 1
            if timestamp in seen_times:
                duplicate_timestamps += 1
            else:
                seen_times.add(timestamp)
            if page_last is not None:
                delta = (timestamp - page_last).total_seconds()
                delta_counts[delta] += 1
                if delta <= 0:
                    nonmonotonic_timestamps += 1
            elif previous_last_time is not None:
                delta = (timestamp - previous_last_time).total_seconds()
                delta_counts[delta] += 1
                if delta <= 0:
                    nonmonotonic_timestamps += 1
            page_first = page_first or timestamp
            page_last = timestamp
            if row["sensor"] != sensor:
                sensor_mismatches += 1
            row_flagged = False
            for flag in FLAGS:
                value = row.get(flag)
                if value == "T":
                    flag_true[flag] += 1
                    row_flagged = True
                elif value not in {"F", None}:
                    flag_invalid[flag] += 1
            level = row.get("slevel")
            if level is None:
                null_levels += 1
            elif isinstance(level, (int, float)) and math.isfinite(float(level)):
                numeric_values.append(float(level))
                if not row_flagged:
                    clean_values.append(float(level))
            else:
                schema_errors += 1
        if page_first is not None:
            first_time = first_time or page_first
            last_time = page_last
            previous_last_time = page_last
        page_reports.append(
            {
                "file": path.name,
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
                "schema_valid": page_schema_valid,
                "rows": len(rows),
                "first_time": page_first.isoformat() if page_first else None,
                "last_time": page_last.isoformat() if page_last else None,
                "pagination": pagination,
            }
        )

    numeric_values.sort()
    clean_values.sort()
    positive_deltas = [
        value for value, count in delta_counts.items() for _ in range(count) if value > 0
    ]
    positive_deltas.sort()
    long_gap_threshold = (expected_interval or 60) * 1.5
    long_gap_count = sum(
        count for value, count in delta_counts.items() if value > long_gap_threshold
    )
    return {
        "sensor": sensor,
        "expected_interval_seconds": expected_interval,
        "completed_pages": len(pages),
        "staging_pages": len(staging),
        "staging_files": [path.name for path in staging],
        "reported_total_pages": sorted(total_pages_values),
        "reported_total_days": sorted(total_days_values),
        "pagination_missing_pages": pagination_missing_pages,
        "rows": timestamp_count,
        "first_time": first_time.isoformat() if first_time else None,
        "last_time": last_time.isoformat() if last_time else None,
        "duplicate_timestamps": duplicate_timestamps,
        "nonmonotonic_timestamps": nonmonotonic_timestamps,
        "sensor_mismatches": sensor_mismatches,
        "schema_errors": schema_errors,
        "qc_unavailable_rows": qc_unavailable_rows,
        "null_levels": null_levels,
        "flag_true_counts": dict(flag_true),
        "invalid_flag_counts": dict(flag_invalid),
        "median_positive_interval_seconds": percentile(positive_deltas, 0.5),
        "maximum_positive_gap_seconds": max(positive_deltas, default=None),
        "long_gap_count": long_gap_count,
        "all_values_m": {
            "count": len(numeric_values),
            "minimum": min(numeric_values, default=None),
            "p01": percentile(numeric_values, 0.01),
            "median": percentile(numeric_values, 0.5),
            "p99": percentile(numeric_values, 0.99),
            "maximum": max(numeric_values, default=None),
        },
        "unflagged_values_m": {
            "count": len(clean_values),
            "minimum": min(clean_values, default=None),
            "p01": percentile(clean_values, 0.01),
            "median": percentile(clean_values, 0.5),
            "p99": percentile(clean_values, 0.99),
            "maximum": max(clean_values, default=None),
        },
        "pages": page_reports,
    }


def main() -> int:
    args = parse_args()
    snapshot = args.snapshot.resolve()
    research = snapshot / "research"
    if not research.is_dir():
        raise SystemExit(f"Research directory not found: {research}")
    sensors = [
        audit_sensor(path)
        for path in sorted(research.iterdir())
        if path.is_dir()
    ]
    report = {
        "schema_version": "1.0",
        "station": "PRIC",
        "snapshot": str(snapshot),
        "generated_utc": datetime.now(UTC).isoformat(),
        "status": "partial" if any(item["staging_pages"] for item in sensors) else "complete",
        "sensors": sensors,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    summary = {
        item["sensor"]: {
            key: item[key]
            for key in (
                "completed_pages",
                "staging_pages",
                "rows",
                "first_time",
                "last_time",
                "duplicate_timestamps",
                "nonmonotonic_timestamps",
                "sensor_mismatches",
                "schema_errors",
            )
        }
        for item in sensors
    }
    print(json.dumps(summary, indent=2))
    print(f"Audit: {args.output.resolve()}")
    return 1 if any(item["schema_errors"] for item in sensors) else 0


if __name__ == "__main__":
    raise SystemExit(main())
