#!/usr/bin/env python3
"""Audit PSMSL/NOC original-frequency PRIC archives without extracting them."""

from __future__ import annotations

import argparse
import csv
import io
import json
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from zipfile import BadZipFile, ZipFile


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def audit_archive(path: Path) -> dict[str, object]:
    with ZipFile(path) as archive:
        members = [item for item in archive.infolist() if not item.is_dir()]
        if len(members) != 1:
            raise BadZipFile(f"{path} contains {len(members)} files; expected one")
        member = members[0]
        row_count = 0
        column_counts: Counter[int] = Counter()
        flags: Counter[str] = Counter()
        first_timestamp: str | None = None
        last_timestamp: str | None = None
        timestamps_with_time = 0
        dates: set[str] = set()
        with archive.open(member) as raw:
            stream = io.TextIOWrapper(raw, encoding="utf-8", newline="")
            for row in csv.reader(stream):
                if not row:
                    continue
                row_count += 1
                column_counts[len(row)] += 1
                timestamp = row[0].strip()
                first_timestamp = first_timestamp or timestamp
                last_timestamp = timestamp
                if ":" in timestamp or "T" in timestamp:
                    timestamps_with_time += 1
                dates.add(timestamp[:10])
                if len(row) >= 3:
                    flags[row[2].strip()] += 1
    return {
        "archive": str(path),
        "member": member.filename,
        "compressed_bytes": path.stat().st_size,
        "uncompressed_bytes": member.file_size,
        "row_count": row_count,
        "column_counts": dict(sorted(column_counts.items())),
        "first_timestamp_field": first_timestamp,
        "last_timestamp_field": last_timestamp,
        "unique_date_count": len(dates),
        "timestamp_fields_containing_time": timestamps_with_time,
        "flag_counts": dict(sorted(flags.items())),
    }


def main() -> int:
    args = parse_args()
    snapshot = args.snapshot.resolve()
    root = snapshot / "psmsl/cme/original-frequency"
    reports = [
        audit_archive(path)
        for path in sorted(root.glob("*/*.zip"))
    ]
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    result = {
        "schema_version": "1.0",
        "station": "Prickly Bay (PRIC)",
        "generated_utc": datetime.now(UTC).isoformat(),
        "source_release": "PSMSL/NOC experimental automatic QC",
        "archives": reports,
        "summary": {
            "archive_count": len(reports),
            "row_count": sum(int(report["row_count"]) for report in reports),
            "archives_with_subdaily_timestamp_fields": sum(
                int(report["timestamp_fields_containing_time"]) > 0
                for report in reports
            ),
            "good_flag_1_rows": sum(
                int(report["flag_counts"].get("1", 0)) for report in reports
            ),
            "flagged_4_rows": sum(
                int(report["flag_counts"].get("4", 0)) for report in reports
            ),
        },
        "critical_limitation": (
            "All inspected original-frequency CSV timestamp fields contain a "
            "calendar date but no time-of-day. Record order alone cannot safely "
            "recover timestamps across within-day gaps. Do not use these ZIPs "
            "for official high/low timing without clarification from PSMSL/NOC "
            "or a correctly timestamped source such as the IOC research API."
        ),
    }
    output.write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(result["summary"], indent=2))
    print(f"Audit: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
