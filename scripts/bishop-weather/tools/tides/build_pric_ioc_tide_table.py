#!/usr/bin/env python3
"""Build a PRIC-primary harmonic tide model and an AST high/low table."""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import math
import platform
import sys
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from statistics import median
from typing import Iterable, Sequence

import numpy as np
import scipy
import utide
from scipy.signal import savgol_filter

from build_pric_tide_table import (
    AST,
    CANDIDATES,
    Event,
    candidate_validation,
    detect_regular_events,
    dt64_to_utc,
    enforce_alternation,
    fit_model,
    load_uhslc_hourly,
    pair_events,
    parse_uhslc_calendar,
    predict,
    prediction_grid,
    selected_events,
    split_contiguous,
    structural_checks,
    write_artifact_manifest,
    write_coefficients,
)


QC_FLAGS = (
    "missing",
    "out_of_range",
    "spikes_via_median",
    "exceeded_neighbours",
    "flat_line",
    "distinctness",
    "completeness",
    "shift",
)
MIN_CLEAN_PER_HOUR = {"rad": 20, "bub": 4}
PUBLISHED_UHSLC_MLLW_OFFSET_M = 0.37


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--additional-snapshot", type=Path, action="append", default=[])
    parser.add_argument("--audit", type=Path, required=True)
    parser.add_argument("--rq-csv", type=Path, required=True)
    parser.add_argument("--uhslc-calendar", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--start", type=date.fromisoformat, default=date(2026, 8, 1))
    parser.add_argument("--stop", type=date.fromisoformat, default=date(2026, 9, 30))
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def clean_row(row: dict[str, object], sensor: str) -> bool:
    if row.get("sensor") != sensor:
        return False
    if any(row.get(flag) != "F" for flag in QC_FLAGS):
        return False
    value = row.get("slevel")
    return isinstance(value, (int, float)) and math.isfinite(float(value))


def hourly_interval_midpoint(stime: str) -> np.datetime64:
    """Return HH:30 for a timestamp belonging to the civil hour HH."""
    return np.datetime64(stime[:13].replace(" ", "T") + ":30", "m")


def load_ioc_hourly(
    snapshot: Path | Sequence[Path], sensor: str
) -> tuple[np.ndarray, np.ndarray, dict[str, object]]:
    """Stream native pages and retain a robust median for adequately sampled hours."""
    roots = [snapshot] if isinstance(snapshot, Path) else list(snapshot)
    pages = [page for root in roots for page in sorted((root / "research" / sensor).glob("page-*.json"))]
    if not pages:
        raise ValueError(f"No archived pages for {sensor}")
    minimum = MIN_CLEAN_PER_HOUR[sensor]
    times: list[np.datetime64] = []
    values: list[float] = []
    current_hour: str | None = None
    current_values: list[float] = []
    rows = 0
    clean_rows = 0
    rejected_hours = 0

    def flush() -> None:
        nonlocal rejected_hours
        if current_hour is None:
            return
        if len(current_values) >= minimum:
            # The median summarizes samples across HH:00–HH:59. Label it at
            # the interval midpoint; assigning HH:00 introduces an artificial
            # ~30-minute phase shift in the fitted harmonic model.
            times.append(hourly_interval_midpoint(current_hour))
            values.append(float(median(current_values)))
        else:
            rejected_hours += 1

    for page in pages:
        payload = json.loads(page.read_text(encoding="utf-8"))
        for row in payload["data"]:
            rows += 1
            hour = str(row["stime"])[:13]
            if current_hour is not None and hour != current_hour:
                flush()
                current_values = []
            current_hour = hour
            if clean_row(row, sensor):
                current_values.append(float(row["slevel"]))
                clean_rows += 1
    flush()
    result_times = np.asarray(times, dtype="datetime64[m]")
    result_values = np.asarray(values, dtype=float)
    if len(result_times) < 24 * 365:
        raise ValueError(f"Insufficient clean hourly coverage for {sensor}: {len(result_times)}")
    return result_times, result_values, {
        "sensor": sensor,
        "native_rows": rows,
        "clean_native_rows": clean_rows,
        "clean_native_percent": round(100 * clean_rows / rows, 4),
        "hourly_medians": len(result_times),
        "rejected_low_coverage_hours": rejected_hours,
        "minimum_clean_samples_per_hour": minimum,
        "first_hour_utc": str(result_times.min()),
        "last_hour_utc": str(result_times.max()),
    }


def write_hourly_csv(path: Path, times: np.ndarray, values: np.ndarray) -> None:
    with gzip.open(path, "xt", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(["timestamp_utc", "median_water_level_m", "qc_status"])
        for timestamp, value in zip(times, values):
            writer.writerow([str(timestamp) + ":00Z", format(float(value), ".6f"), "ALL_FLAGS_FALSE"])


def daily_means(times: np.ndarray, values: np.ndarray) -> dict[np.datetime64, float]:
    days = times.astype("datetime64[D]")
    result: dict[np.datetime64, float] = {}
    for day in np.unique(days):
        selected = values[days == day]
        if len(selected) >= 12:
            result[day] = float(np.mean(selected))
    return result


def datum_crosswalk(
    radar_times: np.ndarray,
    radar_values: np.ndarray,
    uhslc_times: np.ndarray,
    uhslc_values: np.ndarray,
) -> dict[str, object]:
    radar_daily = daily_means(radar_times, radar_values)
    uhslc_daily = daily_means(uhslc_times, uhslc_values)
    days = sorted(set(radar_daily) & set(uhslc_daily))
    differences = np.asarray(
        [radar_daily[day] - uhslc_daily[day] for day in days], dtype=float
    )
    if len(differences) < 365:
        raise ValueError("Insufficient daily overlap for the radar-to-UHSLC datum crosswalk")
    offset = float(np.median(differences))
    absolute_deviation = np.abs(differences - offset)
    yearly: list[dict[str, object]] = []
    years = np.asarray([int(str(day)[:4]) for day in days])
    for year in np.unique(years):
        selected = differences[years == year]
        yearly.append(
            {
                "year": int(year),
                "days": int(len(selected)),
                "median_radar_minus_uhslc_m": round(float(np.median(selected)), 6),
                "mad_m": round(
                    float(np.median(np.abs(selected - np.median(selected)))), 6
                ),
            }
        )
    annual_offsets = [item["median_radar_minus_uhslc_m"] for item in yearly]
    return {
        "method": "median of concurrent daily means with at least 12 hourly values per source",
        "overlap_days": len(days),
        "first_day": str(days[0]),
        "last_day": str(days[-1]),
        "radar_minus_uhslc_station_datum_m": round(offset, 8),
        "median_absolute_daily_deviation_m": round(float(np.median(absolute_deviation)), 6),
        "p95_absolute_daily_deviation_m": round(float(np.percentile(absolute_deviation, 95)), 6),
        "annual_median_range_m": round(float(max(annual_offsets) - min(annual_offsets)), 6),
        "annual": yearly,
        "qualification": "Provisional crosswalk; requires GMS benchmark and levelling confirmation.",
    }


def load_recent_binned(
    snapshot: Path | Sequence[Path],
    sensor: str,
    start_utc: np.datetime64,
    stop_utc: np.datetime64,
    bin_minutes: int = 5,
) -> tuple[np.ndarray, np.ndarray, int]:
    bins: dict[int, list[float]] = defaultdict(list)
    rows = 0
    roots = [snapshot] if isinstance(snapshot, Path) else list(snapshot)
    pages = [page for root in roots for page in sorted((root / "research" / sensor).glob("page-*.json"))]
    for page in reversed(pages):
        payload = json.loads(page.read_text(encoding="utf-8"))
        data = payload.get("data", [])
        if not data:
            continue
        first = np.datetime64(str(data[0]["stime"]).replace(" ", "T"), "m")
        last = np.datetime64(str(data[-1]["stime"]).replace(" ", "T"), "m")
        if last < start_utc:
            break
        if first >= stop_utc:
            continue
        for row in data:
            timestamp = np.datetime64(str(row["stime"]).replace(" ", "T"), "m")
            if timestamp < start_utc or timestamp >= stop_utc:
                continue
            rows += 1
            if not clean_row(row, sensor):
                continue
            minute = int(timestamp.astype(np.int64))
            bins[(minute // bin_minutes) * bin_minutes].append(float(row["slevel"]))
    if not bins:
        return np.asarray([], dtype="datetime64[m]"), np.asarray([], dtype=float), rows
    first_bin = min(bins)
    last_bin = max(bins)
    grid = np.arange(first_bin, last_bin + bin_minutes, bin_minutes, dtype=np.int64)
    values = np.full(len(grid), np.nan)
    for index, item in enumerate(grid):
        if item in bins:
            values[index] = float(median(bins[item]))
    finite = np.flatnonzero(np.isfinite(values))
    interpolated = np.interp(np.arange(len(values)), finite, values[finite])
    maximum_bridge = 30 // bin_minutes
    for left, right in zip(finite[:-1], finite[1:]):
        if right - left > maximum_bridge:
            interpolated[left + 1 : right] = np.nan
    return grid.astype("datetime64[m]"), interpolated, rows


def observed_native_events(
    times: np.ndarray, values: np.ndarray, bin_minutes: int
) -> list[Event]:
    finite = np.isfinite(values)
    events: list[Event] = []
    for segment_times, segment_values in split_contiguous(
        times[finite], values[finite], bin_minutes * 2
    ):
        if len(segment_values) < 48:
            continue
        window = max(5, round(120 / bin_minutes))
        if window % 2 == 0:
            window += 1
        window = min(window, len(segment_values) if len(segment_values) % 2 else len(segment_values) - 1)
        if window >= 5:
            segment_values = savgol_filter(segment_values, window, 2)
        events.extend(
            detect_regular_events(
                segment_times,
                segment_values,
                sample_minutes=bin_minutes,
                prominence_m=0.04,
            )
        )
    return enforce_alternation(events)


def native_holdout_validation(
    snapshot: Path | Sequence[Path],
    coefficients,
    start_utc: np.datetime64,
    stop_utc: np.datetime64,
) -> dict[str, object]:
    report: dict[str, object] = {}
    for sensor in ("rad", "bub"):
        times, raw_values, raw_rows = load_recent_binned(
            snapshot, sensor, start_utc, stop_utc, 5
        )
        finite = np.isfinite(raw_values)
        if finite.sum() < 48:
            report[sensor] = {"status": "insufficient_data"}
            continue
        estimates = predict(times[finite], coefficients)
        datum_offset = 0.0
        adjusted = raw_values.copy()
        if sensor == "bub":
            datum_offset = float(np.median(raw_values[finite] - estimates))
            adjusted = raw_values - datum_offset
        residual = estimates - adjusted[finite]
        observed = observed_native_events(times, adjusted, 5)
        minute_grid = np.arange(times[finite].min(), times[finite].max() + 1, np.timedelta64(1, "m"))
        predicted_events = detect_regular_events(
            minute_grid, predict(minute_grid, coefficients), 1, prominence_m=0.0
        )
        report[sensor] = {
            "status": "held_out_native_pric",
            "raw_rows_in_period": raw_rows,
            "regular_five_minute_values": int(finite.sum()),
            "verification_start_utc": str(times[finite].min()),
            "verification_stop_utc": str(times[finite].max()),
            "datum_alignment_m_sensor_minus_radar_model": round(datum_offset, 6),
            "elevation_rmse_m": round(float(np.sqrt(np.mean(residual * residual))), 6),
            "elevation_mae_m": round(float(np.mean(np.abs(residual))), 6),
            "elevation_bias_m": round(float(np.mean(residual)), 6),
            "event_metrics": pair_events(observed, predicted_events),
        }
    return report


def write_events(
    csv_path: Path,
    markdown_path: Path,
    events: Sequence[Event],
    start: date,
    stop: date,
    radar_minus_uhslc_m: float,
    mllw_offset_m: float,
    selected_model: str,
) -> None:
    grouped: dict[date, list[Event]] = defaultdict(list)
    daily_count: dict[date, int] = defaultdict(int)
    with csv_path.open("x", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(
            [
                "date_ast",
                "event_number",
                "event_type",
                "time_ast",
                "time_utc",
                "height_m_pric_radar_datum",
                "height_m_uhslc_station_datum_provisional_crosswalk",
                "height_m_relative_uhslc_mllw_provisional_crosswalk",
                "status",
            ]
        )
        for event in events:
            utc = dt64_to_utc(event.time)
            local = utc.astimezone(AST)
            grouped[local.date()].append(event)
            daily_count[local.date()] += 1
            station_height = event.height_m - radar_minus_uhslc_m
            writer.writerow(
                [
                    local.date().isoformat(),
                    daily_count[local.date()],
                    event.kind,
                    local.strftime("%Y-%m-%d %H:%M AST"),
                    utc.strftime("%Y-%m-%d %H:%M UTC"),
                    format(event.height_m, ".8f"),
                    format(station_height, ".8f"),
                    format(station_height - mllw_offset_m, ".8f"),
                    "PROVISIONAL_INTERNAL_NOT_FOR_NAVIGATION",
                ]
            )
    lines = [
        "# Prickly Bay, Grenada — provisional PRIC-primary tide table",
        "",
        f"Period: {start.isoformat()} through {stop.isoformat()} (AST, UTC−4)",
        "",
        "> **INTERNAL GMS VALIDATION — NOT FOR NAVIGATION.** Timing and tidal amplitudes",
        "> are fitted primarily from QC-clean IOC PRIC radar observations. The MLLW",
        "> column uses a provisional observational crosswalk to",
        "> UHSLC; GMS benchmark and levelling records are still required for approval.",
        f"> Selected held-out PRIC configuration: `{selected_model}`.",
        "> Every alternating mathematical turning point is retained; some dates may not",
        "> contain exactly two highs and two lows because of mixed-tide inequality.",
        "",
        "## August 2026",
        "",
        "| Date (AST) | Time (AST) | Date (UTC) | Time (UTC) | Event | Provisional UHSLC MLLW (m) |",
        "|---|---:|---|---:|---|---:|",
    ]
    current = start
    while current <= stop:
        if current == date(2026, 9, 1):
            lines.extend(
                [
                    "",
                    "## September 2026",
                    "",
                    "| Date (AST) | Time (AST) | Date (UTC) | Time (UTC) | Event | Provisional UHSLC MLLW (m) |",
                    "|---|---:|---|---:|---|---:|",
                ]
            )
        if not grouped.get(current):
            lines.append(f"| {current.isoformat()} | — | — | — | No turning point | — |")
        for event in grouped.get(current, []):
            utc = dt64_to_utc(event.time)
            local = utc.astimezone(AST)
            station_height = event.height_m - radar_minus_uhslc_m
            lines.append(
                f"| {current.isoformat()} | {local:%H:%M} | {utc:%Y-%m-%d} | "
                f"{utc:%H:%M} | {event.kind.title()} | "
                f"{station_height - mllw_offset_m:.2f} |"
            )
        current += timedelta(days=1)
    markdown_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_minute_predictions(
    path: Path,
    grid: np.ndarray,
    heights: np.ndarray,
    radar_minus_uhslc_m: float,
    mllw_offset_m: float,
) -> None:
    with gzip.open(path, "xt", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(
            [
                "timestamp_utc",
                "timestamp_ast",
                "height_m_pric_radar_datum",
                "height_m_uhslc_station_datum_provisional_crosswalk",
                "height_m_relative_uhslc_mllw_provisional_crosswalk",
            ]
        )
        for timestamp, height in zip(grid, heights):
            utc = dt64_to_utc(timestamp)
            station_height = float(height) - radar_minus_uhslc_m
            writer.writerow(
                [
                    utc.strftime("%Y-%m-%dT%H:%M:00Z"),
                    utc.astimezone(AST).strftime("%Y-%m-%dT%H:%M:00-04:00"),
                    format(float(height), ".10f"),
                    format(station_height, ".10f"),
                    format(station_height - mllw_offset_m, ".10f"),
                ]
            )


def write_validation_summary(path: Path, validation: dict[str, object]) -> None:
    selected = str(validation["selected_model"])
    lines = [
        "# PRIC-primary model validation",
        "",
        f"Selected configuration: `{selected}`.",
        "",
        "## Candidate validation on held-out PRIC radar observations",
        "",
        "| Candidate | Constituents | Elevation RMSE (m) | Median event timing error (min) | Median event height error (m) | Score |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name, metrics in validation["candidate_results"].items():
        event = metrics["event_metrics"]
        lines.append(
            f"| {name} | {metrics['fitted_constituent_count']} | "
            f"{metrics['elevation_rmse_m']:.4f} | "
            f"{event['median_absolute_timing_error_minutes']} | "
            f"{event['median_absolute_height_error_m']} | "
            f"{metrics['selection_score']:.4f} |"
        )
    lines.extend(
        [
            "",
            "## August 1–16 native PRIC holdout",
            "",
            "This check uses a model fitted only through July 31, so August observations",
            "were not available to that verification fit.",
            "",
            "| Sensor | Elevation RMSE (m) | Median event timing error (min) | P95 timing error (min) | Median event height error (m) |",
            "|---|---:|---:|---:|---:|",
        ]
    )
    for sensor, metrics in validation["august_native_holdout"].items():
        if metrics.get("status") == "insufficient_data":
            lines.append(f"| {sensor} | insufficient data | — | — | — |")
            continue
        event = metrics["event_metrics"]
        lines.append(
            f"| {sensor} | {metrics['elevation_rmse_m']:.4f} | "
            f"{event['median_absolute_timing_error_minutes']} | "
            f"{event['p95_absolute_timing_error_minutes']} | "
            f"{event['median_absolute_height_error_m']} |"
        )
    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            "- PRIC radar is the primary fitting record.",
            "- PRIC bubbler is an independent local sensor check after a robust datum offset.",
            "- PRIC pressure is archived but excluded because its QC and level regime are not stable.",
            "- UHSLC is used only for a provisional height-datum crosswalk and an independent long-record reference.",
            "- Modelled astronomical tide excludes weather-driven surge, waves, and short-period sea-level anomalies.",
        ]
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    if args.stop < args.start:
        raise SystemExit("--stop must be on or after --start")
    snapshot = args.snapshot.resolve()
    additional_snapshots = [path.resolve() for path in args.additional_snapshot]
    snapshots = [snapshot, *additional_snapshots]
    audit = args.audit.resolve()
    rq_csv = args.rq_csv.resolve()
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=False)

    radar_times, radar_values, radar_summary = load_ioc_hourly(snapshots, "rad")
    bubbler_times, bubbler_values, bubbler_summary = load_ioc_hourly(snapshots, "bub")
    write_hourly_csv(output / "pric-radar-qc-clean-hourly-medians.csv.gz", radar_times, radar_values)
    write_hourly_csv(output / "pric-bubbler-qc-clean-hourly-medians.csv.gz", bubbler_times, bubbler_values)

    selected, candidates = candidate_validation(radar_times, radar_values)
    selected_constituents = CANDIDATES[selected]
    august_start_utc = np.datetime64(
        datetime.combine(args.start, time.min, tzinfo=AST).astimezone(UTC).replace(tzinfo=None),
        "m",
    )
    pre_august = radar_times < august_start_utc
    pre_august_coefficients = fit_model(
        radar_times[pre_august], radar_values[pre_august], selected_constituents
    )
    observation_stop = radar_times.max() + np.timedelta64(1, "h")
    august_holdout = native_holdout_validation(
        snapshots,
        pre_august_coefficients,
        august_start_utc,
        observation_stop,
    )

    final_coefficients = fit_model(radar_times, radar_values, selected_constituents)
    grid = prediction_grid(args.start, args.stop)
    heights = predict(grid, final_coefficients)
    events = selected_events(grid, heights, args.start, args.stop)
    checks = structural_checks(events, args.start, args.stop)

    uhslc_times, uhslc_values = load_uhslc_hourly(rq_csv)
    crosswalk = datum_crosswalk(radar_times, radar_values, uhslc_times, uhslc_values)
    radar_minus_uhslc = float(crosswalk["radar_minus_uhslc_station_datum_m"])
    mllw_offset = PUBLISHED_UHSLC_MLLW_OFFSET_M
    calendar_comparison: dict[str, object] | None = None
    if args.uhslc_calendar:
        published, mllw_offset = parse_uhslc_calendar(args.uhslc_calendar.resolve())
        selected_published = [
            item
            for item in published
            if args.start <= dt64_to_utc(item.time).astimezone(AST).date() <= args.stop
        ]
        converted_events = [
            Event(item.time, item.kind, item.height_m - radar_minus_uhslc)
            for item in events
        ]
        calendar_comparison = {
            "source": str(args.uhslc_calendar.resolve()),
            "source_sha256": sha256(args.uhslc_calendar.resolve()),
            "published_mllw_offset_m_above_uhslc_station_datum": mllw_offset,
            "metrics": pair_events(selected_published, converted_events, tolerance_minutes=120),
            "qualification": "Independent harmonic-calendar comparison, not observational truth.",
        }

    stem = f"pric-tides-{args.start.isoformat()}-to-{args.stop.isoformat()}"
    write_events(
        output / f"{stem}.csv",
        output / f"{stem}.md",
        events,
        args.start,
        args.stop,
        radar_minus_uhslc,
        mllw_offset,
        selected,
    )
    write_minute_predictions(
        output / f"{stem}-minute-predictions.csv.gz",
        grid,
        heights,
        radar_minus_uhslc,
        mllw_offset,
    )
    write_coefficients(output / "model-coefficients.csv", final_coefficients)

    validation = {
        "schema_version": "1.0",
        "station": "PRIC — Prickly Bay, Grenada",
        "primary_authority": "IOC PRIC QC-clean radar observations",
        "selected_model": selected,
        "selection_rule": (
            "Minimum held-out PRIC score = elevation RMSE/0.10 m + median event "
            "height error/0.10 m + median event timing error/60 min."
        ),
        "candidate_training": "PRIC radar observations before 2020-01-01 UTC",
        "candidate_held_out_validation": "PRIC radar observations 2020-01-01 through 2024-12-31 UTC",
        "candidate_results": candidates,
        "august_native_holdout": august_holdout,
        "datum_crosswalk": crosswalk,
        "uhslc_published_calendar_comparison": calendar_comparison,
        "structural_checks": checks,
    }
    (output / "validation.json").write_text(
        json.dumps(validation, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    write_validation_summary(output / "validation-summary.md", validation)

    metadata = {
        "schema_version": "1.0",
        "generated_utc": datetime.now(UTC).isoformat(),
        "station": "PRIC — Prickly Bay, Grenada",
        "primary_authority": "IOC PRIC QC-clean radar observations",
        "source": {
            "ioc_snapshot": str(snapshot),
            "ioc_manifest": str(snapshot / "manifest.json"),
            "ioc_manifest_sha256": sha256(snapshot / "manifest.json"),
            "ioc_additional_snapshots": [str(path) for path in additional_snapshots],
            "ioc_full_audit": str(audit),
            "ioc_full_audit_sha256": sha256(audit),
            "uhslc_rq_csv_datum_crosswalk_only": str(rq_csv),
            "uhslc_rq_csv_sha256": sha256(rq_csv),
        },
        "derived_training_data": {"radar": radar_summary, "bubbler": bubbler_summary},
        "pressure_sensor_use": "excluded_from_fit_due_to_full_record_qc_and_level_regime_instability",
        "selected_model": selected,
        "fitted_constituents": list(map(str, final_coefficients.name)),
        "fitted_constituent_count": len(final_coefficients.name),
        "mean_level_m_pric_radar_datum": float(final_coefficients.mean),
        "event_count": len(events),
        "period_ast": {"start": args.start.isoformat(), "stop": args.stop.isoformat()},
        "software": {
            "python": sys.version,
            "platform": platform.platform(),
            "numpy": np.__version__,
            "scipy": scipy.__version__,
            "utide": utide.__version__,
        },
        "model_options": {
            "latitude_degrees_north": 12.005392,
            "trend": False,
            "method": "ols",
            "confidence_intervals": "none",
            "nodal_corrections": True,
            "phase": "Greenwich",
            "event_minimum_prominence_m": 0.0,
            "event_minimum_same_type_separation_hours": 8,
            "event_time_refinement": "three-point parabolic interpolation",
            "published_uhslc_mllw_offset_m": mllw_offset,
            "radar_minus_uhslc_station_datum_crosswalk_m": radar_minus_uhslc,
        },
        "qualification": (
            "PROVISIONAL INTERNAL GMS VALIDATION. PRIC observations are primary. "
            "Height datum crosswalk is not benchmark-approved; not for navigation."
        ),
    }
    (output / "run-metadata.json").write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    write_artifact_manifest(output)
    print(
        json.dumps(
            {
                "selected_model": selected,
                "fitted_constituents": len(final_coefficients.name),
                "event_count": len(events),
                "output": str(output),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
