#!/usr/bin/env python3
"""Summarize observed extrema in an archived IOC live-table window."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import Path


class TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = []

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._row is not None and self._cell is not None:
            self._row.append("".join(self._cell).strip())
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if self._row:
                self.rows.append(self._row)
            self._row = None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    html = args.input.read_text(encoding="utf-8", errors="replace")
    table = TableParser()
    table.feed(html)
    header = next(row for row in table.rows if row and row[0] == "Time (UTC)")
    names = [value.split("(")[0] for value in header]
    observations: dict[str, list[tuple[datetime, float]]] = {
        name: [] for name in names[1:]
    }
    timestamps: list[datetime] = []
    for row in table.rows[table.rows.index(header) + 1 :]:
        if len(row) != len(header):
            continue
        timestamp = datetime.strptime(row[0], "%Y-%m-%d %H:%M:%S").replace(tzinfo=UTC)
        timestamps.append(timestamp)
        for name, value in zip(names[1:], row[1:]):
            if value:
                try:
                    observations[name].append((timestamp, float(value)))
                except ValueError:
                    pass

    summary: dict[str, object] = {}
    for name in ("bub", "rad", "prs"):
        values = observations.get(name, [])
        if not values:
            continue
        low = min(values, key=lambda item: item[1])
        high = max(values, key=lambda item: item[1])
        summary[name] = {
            "observation_count": len(values),
            "minimum": {"time_utc": low[0].isoformat(), "value_m": low[1]},
            "maximum": {"time_utc": high[0].isoformat(), "value_m": high[1]},
            "range_m": round(high[1] - low[1], 3),
        }
    result = {
        "schema_version": "1.0",
        "station": "Prickly Bay (PRIC)",
        "source_file": str(args.input),
        "window_start_utc": min(timestamps).isoformat(),
        "window_stop_utc": max(timestamps).isoformat(),
        "sensor_extrema": summary,
        "qualification": (
            "Raw near-real-time observed extrema within this finite window, "
            "not quality-controlled tidal high/low events and not transformed "
            "to an approved GMS datum."
        ),
        "pressure_warning": (
            "The pressure channel contains a repeating within-cycle offset and "
            "is retained for diagnosis, not accepted as a tide-height series."
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
