#!/usr/bin/env python3
"""Fit, validate, and generate an internal PRIC astronomical tide table."""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import math
import platform
import re
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
import scipy
from scipy.signal import find_peaks, savgol_filter
import utide
from utide import reconstruct, solve


LATITUDE = 12.005392
AST = timezone(timedelta(hours=-4), name="AST")
FILL_VALUES = {-32767, -32768, 9999, 99999}
TRAINING_CUTOFF = np.datetime64("2020-01-01T00:00")
VALIDATION_START = np.datetime64("2020-01-01T00:00")
VALIDATION_STOP = np.datetime64("2025-01-01T00:00")

CORE_8 = ("M2", "S2", "N2", "K2", "K1", "O1", "P1", "Q1")
STANDARD_15 = (
    "SA",
    "SSA",
    "MM",
    "MF",
    "Q1",
    "O1",
    "P1",
    "K1",
    "N2",
    "M2",
    "S2",
    "K2",
    "MN4",
    "M4",
    "MS4",
)
EXTENDED_30 = (
    "SA",
    "SSA",
    "MM",
    "MF",
    "2Q1",
    "Q1",
    "RHO1",
    "O1",
    "P1",
    "K1",
    "J1",
    "OO1",
    "2N2",
    "MU2",
    "N2",
    "NU2",
    "M2",
    "L2",
    "T2",
    "S2",
    "R2",
    "K2",
    "M3",
    "MK3",
    "SK3",
    "N4",
    "MN4",
    "M4",
    "MS4",
    "S4",
)
CANDIDATES: dict[str, Sequence[str] | str] = {
    "core-8": CORE_8,
    "standard-15": STANDARD_15,
    "extended-30": EXTENDED_30,
    "utide-auto": "auto",
}


@dataclass(frozen=True)
class Event:
    time: np.datetime64
    kind: str
    height_m: float


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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rq-csv", type=Path, required=True)
    parser.add_argument("--ioc-live-html", type=Path)
    parser.add_argument(
        "--uhslc-calendar",
        type=Path,
        action="append",
        default=[],
        help="Published UHSLC monthly prediction text; repeat for each month.",
    )
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--start", type=date.fromisoformat, default=date(2026, 7, 1))
    parser.add_argument("--stop", type=date.fromisoformat, default=date(2026, 8, 31))
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def load_uhslc_hourly(path: Path) -> tuple[np.ndarray, np.ndarray]:
    timestamps: list[np.datetime64] = []
    values: list[float] = []
    with path.open(newline="", encoding="utf-8") as stream:
        for line_number, row in enumerate(csv.reader(stream), 1):
            if len(row) < 5:
                raise ValueError(f"{path}:{line_number}: expected five columns")
            year, month, day, hour, value = map(int, row[:5])
            if value in FILL_VALUES:
                continue
            timestamps.append(
                np.datetime64(
                    f"{year:04}-{month:02}-{day:02}T{hour:02}:00", "m"
                )
            )
            values.append(value / 1000.0)
    return np.asarray(timestamps), np.asarray(values, dtype=float)


def fit_model(
    times: np.ndarray, values: np.ndarray, constituents: Sequence[str] | str
):
    return solve(
        times,
        values,
        lat=LATITUDE,
        constit=constituents,
        trend=False,
        method="ols",
        conf_int="none",
        nodal=True,
        phase="Greenwich",
        verbose=False,
    )


def predict(times: np.ndarray, coefficients) -> np.ndarray:
    return np.asarray(
        reconstruct(times, coefficients, min_SNR=0, verbose=False).h,
        dtype=float,
    )


def enforce_alternation(events: Iterable[Event]) -> list[Event]:
    result: list[Event] = []
    for event in sorted(events, key=lambda item: item.time):
        if not result or result[-1].kind != event.kind:
            result.append(event)
            continue
        prior = result[-1]
        if (event.kind == "HIGH" and event.height_m > prior.height_m) or (
            event.kind == "LOW" and event.height_m < prior.height_m
        ):
            result[-1] = event
    return result


def detect_regular_events(
    times: np.ndarray,
    values: np.ndarray,
    sample_minutes: int,
    prominence_m: float = 0.02,
) -> list[Event]:
    def refined(index: int, kind: str) -> Event:
        height = float(values[index])
        shift_minutes = 0
        if 0 < index < len(values) - 1:
            left = float(values[index - 1])
            center = float(values[index])
            right = float(values[index + 1])
            denominator = left - 2 * center + right
            if denominator:
                offset = 0.5 * (left - right) / denominator
                if abs(offset) <= 1:
                    shift_minutes = round(offset * sample_minutes)
                    height = center - 0.25 * (left - right) * offset
        return Event(
            times[index] + np.timedelta64(shift_minutes, "m"),
            kind,
            height,
        )

    distance = max(1, round(8 * 60 / sample_minutes))
    highs, _ = find_peaks(values, distance=distance, prominence=prominence_m)
    lows, _ = find_peaks(-values, distance=distance, prominence=prominence_m)
    events = [
        *(refined(index, "HIGH") for index in highs),
        *(refined(index, "LOW") for index in lows),
    ]
    return enforce_alternation(events)


def split_contiguous(
    times: np.ndarray, values: np.ndarray, max_gap_minutes: int
) -> list[tuple[np.ndarray, np.ndarray]]:
    if len(times) == 0:
        return []
    gaps = np.diff(times).astype("timedelta64[m]").astype(int)
    boundaries = np.flatnonzero(gaps > max_gap_minutes) + 1
    indices = np.concatenate(([0], boundaries, [len(times)]))
    return [
        (times[start:stop], values[start:stop])
        for start, stop in zip(indices[:-1], indices[1:])
        if stop - start >= 48
    ]


def detect_observed_hourly_events(
    times: np.ndarray, values: np.ndarray
) -> list[Event]:
    events: list[Event] = []
    for segment_times, segment_values in split_contiguous(times, values, 90):
        events.extend(
            detect_regular_events(
                segment_times,
                segment_values,
                sample_minutes=60,
                prominence_m=0.04,
            )
        )
    return enforce_alternation(events)


def pair_events(
    observed: Sequence[Event],
    predicted: Sequence[Event],
    tolerance_minutes: int = 240,
) -> dict[str, object]:
    used: set[int] = set()
    pairs: list[tuple[Event, Event]] = []
    for prediction in predicted:
        choices = [
            (index, observation)
            for index, observation in enumerate(observed)
            if index not in used and observation.kind == prediction.kind
        ]
        if not choices:
            continue
        index, observation = min(
            choices,
            key=lambda item: abs(
                int((item[1].time - prediction.time) / np.timedelta64(1, "m"))
            ),
        )
        delta = abs(
            int((observation.time - prediction.time) / np.timedelta64(1, "m"))
        )
        if delta <= tolerance_minutes:
            used.add(index)
            pairs.append((observation, prediction))
    timing = [
        abs(int((observation.time - prediction.time) / np.timedelta64(1, "m")))
        for observation, prediction in pairs
    ]
    heights = [
        abs(observation.height_m - prediction.height_m)
        for observation, prediction in pairs
    ]
    return {
        "observed_events": len(observed),
        "predicted_events": len(predicted),
        "matched_events": len(pairs),
        "match_rate_percent": round(
            100 * len(pairs) / max(len(observed), len(predicted), 1), 3
        ),
        "median_absolute_timing_error_minutes": (
            round(float(np.median(timing)), 3) if timing else None
        ),
        "mean_absolute_timing_error_minutes": (
            round(float(np.mean(timing)), 3) if timing else None
        ),
        "p95_absolute_timing_error_minutes": (
            round(float(np.percentile(timing, 95)), 3) if timing else None
        ),
        "median_absolute_height_error_m": (
            round(float(np.median(heights)), 5) if heights else None
        ),
        "mean_absolute_height_error_m": (
            round(float(np.mean(heights)), 5) if heights else None
        ),
    }


def parse_uhslc_calendar(path: Path) -> tuple[list[Event], float]:
    text = path.read_text(encoding="utf-8", errors="replace")
    month_match = re.search(
        r"^\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|"
        r"SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{4})\s*$",
        text,
        re.MULTILINE,
    )
    datum_match = re.search(
        r"Mean Lower Low Water \(([-+]?\d+(?:\.\d+)?) M\)", text
    )
    if not month_match or not datum_match:
        raise ValueError(f"Could not parse UHSLC calendar header in {path}")
    month_names = {
        name: index
        for index, name in enumerate(
            (
                "JANUARY",
                "FEBRUARY",
                "MARCH",
                "APRIL",
                "MAY",
                "JUNE",
                "JULY",
                "AUGUST",
                "SEPTEMBER",
                "OCTOBER",
                "NOVEMBER",
                "DECEMBER",
            ),
            1,
        )
    }
    target_month = month_names[month_match.group(1)]
    target_year = int(month_match.group(2))
    datum_m = float(datum_match.group(1))
    lines = text.splitlines()
    start = next(
        index for index, line in enumerate(lines) if line.startswith("   Time")
    ) + 1
    rows = [line.ljust(68) for line in lines[start:] if line.strip()]
    records: list[tuple[np.datetime64, float]] = []
    for group_start in range(0, len(rows), 4):
        group = rows[group_start : group_start + 4]
        if len(group) < 4:
            continue
        for column, left in enumerate((0, 17, 34, 51)):
            blocks = [line[left : left + 17] for line in group]
            day_match = re.match(r"\s*(\d{2})\s+", blocks[0])
            if not day_match:
                continue
            day = int(day_match.group(1))
            month = target_month
            year = target_year
            if column == 3 and day < 25:
                month += 1
                if month == 13:
                    month = 1
                    year += 1
            if month != target_month or year != target_year:
                continue
            for block in blocks:
                value_match = re.search(
                    r"(\d{2}):(\d{2})\s+([-+]?\d+(?:\.\d+)?)", block
                )
                if not value_match:
                    continue
                hour, minute = map(int, value_match.group(1, 2))
                height_mllw = float(value_match.group(3))
                local = datetime(
                    year, month, day, hour, minute, tzinfo=AST
                )
                utc = local.astimezone(UTC).replace(tzinfo=None)
                records.append(
                    (np.datetime64(utc, "m"), height_mllw + datum_m)
                )
    records.sort()
    events: list[Event] = []
    for index, (timestamp, height) in enumerate(records):
        if index == 0:
            kind = "HIGH" if height > records[index + 1][1] else "LOW"
        else:
            kind = "LOW" if events[-1].kind == "HIGH" else "HIGH"
        events.append(Event(timestamp, kind, height))
    return events, datum_m


def candidate_validation(
    all_times: np.ndarray, all_values: np.ndarray
) -> tuple[str, dict[str, object]]:
    training = all_times < TRAINING_CUTOFF
    validation = (all_times >= VALIDATION_START) & (all_times < VALIDATION_STOP)
    validation_times = all_times[validation]
    validation_values = all_values[validation]
    observed_events = detect_observed_hourly_events(
        validation_times, validation_values
    )
    results: dict[str, object] = {}
    for name, constituents in CANDIDATES.items():
        coefficients = fit_model(
            all_times[training], all_values[training], constituents
        )
        estimates = predict(validation_times, coefficients)
        residual = estimates - validation_values
        predicted_events = detect_observed_hourly_events(
            validation_times, estimates
        )
        event_metrics = pair_events(observed_events, predicted_events)
        timing = event_metrics["median_absolute_timing_error_minutes"]
        height = event_metrics["median_absolute_height_error_m"]
        rmse = float(np.sqrt(np.mean(residual * residual)))
        # Fixed normalization only ranks candidates; it is not an acceptance limit.
        selection_score = (
            rmse / 0.10
            + (float(height) / 0.10 if height is not None else 100)
            + (float(timing) / 60 if timing is not None else 100)
        )
        results[name] = {
            "requested_constituents": (
                list(constituents) if constituents != "auto" else "auto"
            ),
            "fitted_constituent_count": len(coefficients.name),
            "fitted_constituents": list(map(str, coefficients.name)),
            "validation_observations": len(validation_values),
            "elevation_rmse_m": round(rmse, 6),
            "elevation_mae_m": round(float(np.mean(np.abs(residual))), 6),
            "elevation_bias_m": round(float(np.mean(residual)), 6),
            "event_metrics": event_metrics,
            "selection_score": round(selection_score, 6),
        }
    selected = min(results, key=lambda key: results[key]["selection_score"])
    return selected, results


def parse_ioc_sensor(
    path: Path, sensor: str
) -> tuple[np.ndarray, np.ndarray]:
    parser = TableParser()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    header = next(row for row in parser.rows if row and row[0] == "Time (UTC)")
    names = [value.split("(")[0] for value in header]
    sensor_index = names.index(sensor)
    observations: list[tuple[np.datetime64, float]] = []
    for row in parser.rows[parser.rows.index(header) + 1 :]:
        if len(row) != len(header) or not row[sensor_index]:
            continue
        try:
            observations.append(
                (
                    np.datetime64(row[0].replace(" ", "T"), "m"),
                    float(row[sensor_index]),
                )
            )
        except ValueError:
            continue
    observations.sort()
    return (
        np.asarray([item[0] for item in observations]),
        np.asarray([item[1] for item in observations]),
    )


def regularize_ioc_sensor(
    times: np.ndarray, values: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    # Five-minute medians suppress the repeating intra-cycle measurement
    # pattern evident in the public radar feed.
    minutes = times.astype("datetime64[m]").astype(np.int64)
    bins = (minutes // 5) * 5
    unique_bins = np.unique(bins)
    medians = np.asarray([np.median(values[bins == item]) for item in unique_bins])
    regular_times = np.arange(
        unique_bins.min(), unique_bins.max() + 1, 5, dtype=np.int64
    )
    regular_values = np.full(len(regular_times), np.nan)
    lookup = {item: value for item, value in zip(unique_bins, medians)}
    for index, item in enumerate(regular_times):
        if item in lookup:
            regular_values[index] = lookup[item]
    finite = np.flatnonzero(np.isfinite(regular_values))
    interpolated = np.interp(
        np.arange(len(regular_values)), finite, regular_values[finite]
    )
    # Do not bridge gaps longer than 30 minutes.
    for start, stop in zip(finite[:-1], finite[1:]):
        if stop - start > 6:
            interpolated[start + 1 : stop] = np.nan
    converted_times = regular_times.astype("datetime64[m]")
    return converted_times, interpolated


def ioc_validation(
    path: Path, coefficients
) -> dict[str, object]:
    report: dict[str, object] = {}
    for sensor in ("rad", "bub"):
        raw_times, raw_values = parse_ioc_sensor(path, sensor)
        times, values = regularize_ioc_sensor(raw_times, raw_values)
        finite = np.isfinite(values)
        if finite.sum() < 48:
            report[sensor] = {"status": "insufficient_data"}
            continue
        tidal_at_observations = predict(times[finite], coefficients)
        datum_offset = float(np.median(values[finite] - tidal_at_observations))
        adjusted = values - datum_offset
        observed: list[Event] = []
        for segment_times, segment_values in split_contiguous(
            times[finite], adjusted[finite], 10
        ):
            if len(segment_values) < 13:
                continue
            window = min(13, len(segment_values) if len(segment_values) % 2 else len(segment_values) - 1)
            if window >= 5:
                segment_values = savgol_filter(segment_values, window, 2)
            observed.extend(
                detect_regular_events(
                    segment_times,
                    segment_values,
                    sample_minutes=5,
                    prominence_m=0.04,
                )
            )
        observed = enforce_alternation(observed)
        prediction_times = np.arange(
            times[finite].min(),
            times[finite].max() + np.timedelta64(1, "m"),
            np.timedelta64(1, "m"),
        )
        predicted_values = predict(prediction_times, coefficients)
        predicted_events = detect_regular_events(
            prediction_times, predicted_values, 1
        )
        report[sensor] = {
            "status": "provisional_raw_ioc",
            "raw_observations": len(raw_values),
            "verification_start_utc": str(raw_times.min()),
            "verification_stop_utc": str(raw_times.max()),
            "median_alignment_offset_m_sensor_minus_model": round(
                datum_offset, 6
            ),
            "event_metrics_after_median_datum_alignment": pair_events(
                observed, predicted_events
            ),
        }
    return report


def dt64_to_utc(value: np.datetime64) -> datetime:
    seconds = value.astype("datetime64[s]").astype(int)
    return datetime.fromtimestamp(int(seconds), tz=UTC)


def prediction_grid(start: date, stop: date) -> np.ndarray:
    local_start = datetime.combine(
        start - timedelta(days=1), datetime.min.time(), tzinfo=AST
    )
    local_stop = datetime.combine(
        stop + timedelta(days=2), datetime.min.time(), tzinfo=AST
    )
    utc_start = local_start.astimezone(UTC).replace(tzinfo=None)
    utc_stop = local_stop.astimezone(UTC).replace(tzinfo=None)
    return np.arange(
        np.datetime64(utc_start, "m"),
        np.datetime64(utc_stop, "m"),
        np.timedelta64(1, "m"),
    )


def selected_events(
    grid: np.ndarray,
    heights: np.ndarray,
    start: date,
    stop: date,
) -> list[Event]:
    # Preserve every mathematical turning point. This reproduces the event
    # count in UHSLC's published July/August 2026 calendars; a prominence
    # threshold would incorrectly suppress weak secondary tides.
    events = detect_regular_events(grid, heights, 1, prominence_m=0.0)
    result: list[Event] = []
    for event in events:
        local_date = dt64_to_utc(event.time).astimezone(AST).date()
        if start <= local_date <= stop:
            result.append(event)
    return result


def write_event_csv(
    path: Path, events: Sequence[Event], uhslc_mllw_offset_m: float
) -> None:
    daily_count: dict[date, int] = {}
    with path.open("x", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(
            [
                "date_ast",
                "event_number",
                "event_type",
                "time_ast",
                "time_utc",
                "height_m_uhslc_station_datum",
                "height_m_relative_uhslc_mllw",
                "height_display_m",
                "status",
            ]
        )
        for event in events:
            utc = dt64_to_utc(event.time)
            local = utc.astimezone(AST)
            daily_count[local.date()] = daily_count.get(local.date(), 0) + 1
            writer.writerow(
                [
                    local.date().isoformat(),
                    daily_count[local.date()],
                    event.kind,
                    local.strftime("%Y-%m-%d %H:%M AST"),
                    utc.strftime("%Y-%m-%d %H:%M UTC"),
                    format(event.height_m, ".8f"),
                    format(event.height_m - uhslc_mllw_offset_m, ".8f"),
                    format(event.height_m, ".2f"),
                    "PROVISIONAL_INTERNAL_NOT_FOR_NAVIGATION",
                ]
            )


def write_markdown(
    path: Path,
    events: Sequence[Event],
    start: date,
    stop: date,
    selected_model: str,
    uhslc_mllw_offset_m: float,
) -> None:
    grouped: dict[date, list[Event]] = {}
    for event in events:
        local = dt64_to_utc(event.time).astimezone(AST)
        grouped.setdefault(local.date(), []).append(event)
    lines = [
        "# Prickly Bay, Grenada — provisional tide table",
        "",
        f"Period: {start.isoformat()} through {stop.isoformat()}",
        "",
        "> **INTERNAL GMS VALIDATION — NOT FOR NAVIGATION.** Heights are metres",
        "> relative to the UHSLC station datum, not an approved chart or national datum.",
        f"> Selected harmonic configuration: `{selected_model}`.",
        "> Every alternating mathematical turning point is retained, including weak",
        "> secondary tides during strong diurnal inequality.",
        f"> The comparison column subtracts UHSLC's published {uhslc_mllw_offset_m:.2f} m",
        "> MLLW offset; this does not establish a GMS-approved operational datum.",
        "",
        "| Date (AST) | Event | AST | UTC date/time | Station datum (m) | UHSLC MLLW (m) |",
        "|---|---|---:|---:|---:|---:|",
    ]
    current = start
    while current <= stop:
        for event in grouped.get(current, []):
            utc = dt64_to_utc(event.time)
            local = utc.astimezone(AST)
            lines.append(
                f"| {current.isoformat()} | {event.kind.title()} | "
                f"{local:%H:%M} | {utc:%Y-%m-%d %H:%M} | {event.height_m:.2f} | "
                f"{event.height_m - uhslc_mllw_offset_m:.2f} |"
            )
        if not grouped.get(current):
            lines.append(
                f"| {current.isoformat()} | No turning point | — | — | — | — |"
            )
        current += timedelta(days=1)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_minute_predictions(
    path: Path, grid: np.ndarray, heights: np.ndarray
) -> None:
    with gzip.open(path, "xt", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(
            [
                "timestamp_utc",
                "timestamp_ast",
                "predicted_height_m_uhslc_station_datum",
            ]
        )
        for timestamp, height in zip(grid, heights):
            utc = dt64_to_utc(timestamp)
            writer.writerow(
                [
                    utc.strftime("%Y-%m-%dT%H:%M:00Z"),
                    utc.astimezone(AST).strftime("%Y-%m-%dT%H:%M:00-04:00"),
                    format(float(height), ".10f"),
                ]
            )


def write_coefficients(path: Path, coefficients) -> None:
    with path.open("x", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(
            [
                "constituent",
                "amplitude_m",
                "greenwich_phase_degrees",
                "percent_energy",
            ]
        )
        for name, amplitude, phase, energy in zip(
            coefficients.name,
            coefficients.A,
            coefficients.g,
            coefficients.PE,
        ):
            writer.writerow(
                [
                    name,
                    format(float(amplitude), ".10f"),
                    format(float(phase), ".10f"),
                    format(float(energy), ".10f"),
                ]
            )


def write_artifact_manifest(output_dir: Path) -> Path:
    """Write checksums for every completed output except the manifest itself."""
    manifest_path = output_dir / "artifact-manifest.json"
    records = []
    for path in sorted(output_dir.iterdir(), key=lambda item: item.name):
        if not path.is_file() or path == manifest_path:
            continue
        records.append(
            {
                "bytes": path.stat().st_size,
                "relative_path": path.name,
                "sha256": sha256(path),
            }
        )
    manifest = {
        "schema_version": "1.0",
        "generated_utc": datetime.now(UTC).isoformat(),
        "qualification": (
            "PROVISIONAL INTERNAL GMS VALIDATION. Artifact integrity manifest; "
            "not a GMS publication approval and not for navigation."
        ),
        "records": records,
    }
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return manifest_path


def structural_checks(
    events: Sequence[Event], start: date, stop: date
) -> dict[str, object]:
    expected_dates: set[date] = set()
    current = start
    while current <= stop:
        expected_dates.add(current)
        current += timedelta(days=1)
    observed_dates = {
        dt64_to_utc(event.time).astimezone(AST).date() for event in events
    }
    chronological = all(
        first.time < second.time for first, second in zip(events, events[1:])
    )
    alternating = all(
        first.kind != second.kind for first, second in zip(events, events[1:])
    )
    finite_heights = all(math.isfinite(event.height_m) for event in events)
    missing_dates = sorted(expected_dates - observed_dates)
    checks = {
        "chronological": chronological,
        "alternating_high_low": alternating,
        "finite_heights": finite_heights,
        "all_calendar_dates_have_at_least_one_event": not missing_dates,
        "missing_calendar_dates": [value.isoformat() for value in missing_dates],
    }
    if not all(
        checks[key]
        for key in (
            "chronological",
            "alternating_high_low",
            "finite_heights",
            "all_calendar_dates_have_at_least_one_event",
        )
    ):
        raise ValueError(f"Generated event structural checks failed: {checks}")
    return checks


def write_validation_markdown(
    path: Path,
    selected: str,
    candidates: dict[str, object],
    published_comparison: dict[str, object] | None,
    ioc_report: dict[str, object] | None,
    checks: dict[str, object],
) -> None:
    lines = [
        "# PRIC July–August 2026 validation summary",
        "",
        "Status: **internal GMS validation; not for navigation**.",
        "",
        f"Selected configuration: `{selected}`.",
        "",
        "## Held-out UHSLC research-quality validation",
        "",
        "| Configuration | Constituents | RMSE (m) | Median event time error (min) | Median event height error (m) | Match (%) |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name, result in sorted(
        candidates.items(), key=lambda item: item[1]["selection_score"]
    ):
        event = result["event_metrics"]
        lines.append(
            f"| {name} | {result['fitted_constituent_count']} | "
            f"{result['elevation_rmse_m']:.3f} | "
            f"{event['median_absolute_timing_error_minutes']:.1f} | "
            f"{event['median_absolute_height_error_m']:.3f} | "
            f"{event['match_rate_percent']:.2f} |"
        )
    if published_comparison:
        metrics = published_comparison["metrics"]
        lines.extend(
            [
                "",
                "## UHSLC published July–August 2026 calendar comparison",
                "",
                f"- Events matched: {metrics['matched_events']} of "
                f"{metrics['observed_events']} published events "
                f"({metrics['match_rate_percent']:.1f}%).",
                "- Median absolute timing difference: "
                f"{metrics['median_absolute_timing_error_minutes']:.1f} minutes.",
                "- 95th-percentile absolute timing difference: "
                f"{metrics['p95_absolute_timing_error_minutes']:.1f} minutes.",
                "- Median absolute height difference: "
                f"{metrics['median_absolute_height_error_m']:.3f} m.",
                "- This is an implementation comparison using overlapping source "
                "data, not independent observational truth.",
            ]
        )
    if ioc_report:
        lines.extend(["", "## Provisional IOC 30-day sensor check", ""])
        for sensor in ("bub", "rad"):
            result = ioc_report.get(sensor, {})
            metrics = result.get("event_metrics_after_median_datum_alignment")
            if not metrics:
                continue
            lines.append(
                f"- **{sensor.upper()}**: median timing error "
                f"{metrics['median_absolute_timing_error_minutes']:.1f} min; "
                f"p95 {metrics['p95_absolute_timing_error_minutes']:.1f} min; "
                f"median height error {metrics['median_absolute_height_error_m']:.3f} m "
                "after median datum alignment."
            )
    lines.extend(
        [
            "",
            "## Structural checks",
            "",
            f"- Strict chronological order: {checks['chronological']}.",
            f"- Alternating high/low sequence: {checks['alternating_high_low']}.",
            f"- Finite heights: {checks['finite_heights']}.",
            "- Every July–August calendar date has at least one event: "
            f"{checks['all_calendar_dates_have_at_least_one_event']}.",
            "",
            "## Limitations",
            "",
            "- Heights remain provisional and are not tied to a GMS-approved operational datum.",
            "- The public IOC window has no authenticated research-QC flags.",
            "- The 13.6-year RQ record is shorter than a complete 18.6-year nodal cycle.",
            "- Astronomical predictions do not include weather-driven residual water level.",
        ]
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    if args.stop < args.start:
        raise SystemExit("--stop must be on or after --start")
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=False)
    times, values = load_uhslc_hourly(args.rq_csv)

    selected, candidates = candidate_validation(times, values)
    selected_constituents = CANDIDATES[selected]
    final_coefficients = fit_model(times, values, selected_constituents)
    grid = prediction_grid(args.start, args.stop)
    heights = predict(grid, final_coefficients)
    events = selected_events(grid, heights, args.start, args.stop)
    checks = structural_checks(events, args.start, args.stop)
    published_events: list[Event] = []
    published_offsets: set[float] = set()
    for calendar in args.uhslc_calendar:
        calendar_events, offset = parse_uhslc_calendar(calendar)
        published_events.extend(calendar_events)
        published_offsets.add(offset)
    if len(published_offsets) > 1:
        raise ValueError(
            f"UHSLC calendar MLLW offsets differ: {sorted(published_offsets)}"
        )
    uhslc_mllw_offset_m = next(iter(published_offsets), 0.37)
    published_events = [
        event
        for event in sorted(published_events, key=lambda item: item.time)
        if args.start <= dt64_to_utc(event.time).astimezone(AST).date() <= args.stop
    ]

    stem = f"pric-tides-{args.start.isoformat()}-to-{args.stop.isoformat()}"
    write_event_csv(
        output / f"{stem}.csv", events, uhslc_mllw_offset_m
    )
    write_markdown(
        output / f"{stem}.md",
        events,
        args.start,
        args.stop,
        selected,
        uhslc_mllw_offset_m,
    )
    write_minute_predictions(
        output / f"{stem}-minute-predictions.csv.gz", grid, heights
    )
    write_coefficients(output / "model-coefficients.csv", final_coefficients)

    ioc_report: dict[str, object] | None = None
    if args.ioc_live_html:
        ioc_report = ioc_validation(args.ioc_live_html, final_coefficients)
    published_comparison = (
        {
            "calendar_files": [str(path.resolve()) for path in args.uhslc_calendar],
            "published_mllw_offset_m_above_station_datum": uhslc_mllw_offset_m,
            "metrics": pair_events(published_events, events, tolerance_minutes=120),
            "qualification": (
                "Independent implementation comparison using UHSLC's "
                "published 2011-2020 analysis; it is not independent "
                "observational truth."
            ),
        }
        if published_events
        else None
    )
    validation = {
        "schema_version": "1.0",
        "station": "Prickly Bay, Grenada",
        "selected_model": selected,
        "selection_rule": (
            "Minimum held-out score = elevation RMSE/0.10 m + median event "
            "height error/0.10 m + median event timing error/60 min. "
            "Normalization ranks candidates and is not an acceptance limit."
        ),
        "training_for_selection": "RQ observations before 2020-01-01 UTC",
        "held_out_validation": "RQ observations 2020-01-01 through 2024-12-31 UTC",
        "candidate_results": candidates,
        "ioc_july_provisional_validation": ioc_report,
        "uhslc_published_calendar_comparison": published_comparison,
        "structural_checks": checks,
    }
    (output / "validation.json").write_text(
        json.dumps(validation, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    write_validation_markdown(
        output / "validation-summary.md",
        selected,
        candidates,
        published_comparison,
        ioc_report,
        checks,
    )
    metadata = {
        "schema_version": "1.0",
        "generated_utc": datetime.now(UTC).isoformat(),
        "source": {
            "rq_csv": str(args.rq_csv.resolve()),
            "rq_csv_sha256": sha256(args.rq_csv),
            "ioc_live_html": (
                str(args.ioc_live_html.resolve()) if args.ioc_live_html else None
            ),
            "ioc_live_html_sha256": (
                sha256(args.ioc_live_html) if args.ioc_live_html else None
            ),
            "uhslc_calendars": [
                {"path": str(path.resolve()), "sha256": sha256(path)}
                for path in args.uhslc_calendar
            ],
        },
        "training_observation_count": len(values),
        "training_start_utc": str(times.min()),
        "training_stop_utc": str(times.max()),
        "selected_model": selected,
        "fitted_constituents": list(map(str, final_coefficients.name)),
        "fitted_constituent_count": len(final_coefficients.name),
        "mean_level_m_uhslc_station_datum": float(final_coefficients.mean),
        "event_count": len(events),
        "period_ast": {
            "start": args.start.isoformat(),
            "stop": args.stop.isoformat(),
        },
        "software": {
            "python": sys.version,
            "platform": platform.platform(),
            "numpy": np.__version__,
            "scipy": scipy.__version__,
            "utide": utide.__version__,
        },
        "model_options": {
            "latitude_degrees_north": LATITUDE,
            "trend": False,
            "method": "ols",
            "confidence_intervals": "none",
            "nodal_corrections": True,
            "phase": "Greenwich",
            "event_minimum_prominence_m": 0.0,
            "event_minimum_same_type_separation_hours": 8,
            "event_time_refinement": "three-point parabolic interpolation",
            "published_uhslc_mllw_offset_m": uhslc_mllw_offset_m,
        },
        "qualification": (
            "PROVISIONAL INTERNAL GMS VALIDATION. Heights relative to UHSLC "
            "station datum. Not an approved chart datum and not for navigation."
        ),
    }
    (output / "run-metadata.json").write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    write_artifact_manifest(output)
    print(json.dumps({"selected_model": selected, "event_count": len(events)}, indent=2))
    print(f"Output: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
