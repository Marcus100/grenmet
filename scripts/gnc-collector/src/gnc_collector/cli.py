"""Command line: `render` one file offline, or `collect` one bounded pass."""

import argparse
import math
import os
import sys
from pathlib import Path

from gnc_collector.archive import ConfigurationError, Storage, client_from_env
from gnc_collector.collector import (
    DRY_RUN_STATE_FILE,
    STATE_FILE,
    collect,
    freshness,
)
from gnc_collector.goes import CARIBBEAN, parse_name
from gnc_collector.render import BANDS, render

# File times this far ahead of the clock are a clock or receiver problem.
CLOCK_SKEW_MINUTES = 5.0


def parse_bands(value: str) -> list[int]:
    bands = [int(part) for part in value.split(",") if part]
    unknown = sorted(set(bands) - set(BANDS))
    if unknown:
        raise argparse.ArgumentTypeError(
            f"unsupported band(s) {unknown}; supported: {sorted(BANDS)}"
        )
    return bands


def positive_minutes(value: str) -> float:
    """A positive, finite number: NaN or zero would make the stall check meaningless."""
    try:
        minutes = float(value)
    except ValueError:
        raise argparse.ArgumentTypeError(f"not a number: {value!r}") from None
    if not math.isfinite(minutes) or minutes <= 0:
        raise argparse.ArgumentTypeError("must be a positive, finite number of minutes")
    return minutes


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="gnc-collector", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    one = commands.add_parser("render", help="render one ABI CMIP file to a PNG")
    one.add_argument("file", type=Path)
    one.add_argument("--output", type=Path, required=True)
    one.add_argument("--no-coastlines", action="store_true")

    check = commands.add_parser(
        "check", help="exit 1 if the receiver has stopped delivering files"
    )
    check.add_argument("--input-dir", type=Path, required=True)
    check.add_argument("--bands", type=parse_bands, default=[13, 8])
    check.add_argument(
        "--max-age-minutes",
        type=positive_minutes,
        default=45.0,
        help="newest file per band must have arrived within this many minutes",
    )

    run = commands.add_parser("collect", help="archive new receiver files")
    run.add_argument(
        "--input-dir",
        type=Path,
        required=True,
        help="FAZZT output folder holding GOES-R netCDF files (read only)",
    )
    run.add_argument(
        "--work-dir",
        type=Path,
        required=True,
        help="collector state and rendered images",
    )
    run.add_argument("--bands", type=parse_bands, default=[13, 8])
    run.add_argument("--max-files", type=int, default=12)
    run.add_argument("--no-coastlines", action="store_true")
    run.add_argument(
        "--dry-run",
        action="store_true",
        help="render into --work-dir only; do not call the archive API",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "render":
        scan = parse_name(args.file)
        if scan is None or scan.band not in BANDS:
            print(f"Not a supported ABI CMIP file: {args.file.name}", file=sys.stderr)
            return 2
        size = render(
            args.file,
            BANDS[scan.band],
            CARIBBEAN,
            scan.scan_start,
            args.output,
            coastlines=not args.no_coastlines,
        )
        print(f"{args.output} {size[0]}x{size[1]}")
        return 0

    if not args.input_dir.is_dir():
        print(f"Input folder does not exist: {args.input_dir}", file=sys.stderr)
        return 2
    if args.command == "check":
        stale = False
        for band in freshness(args.input_dir, args.bands):
            if band.newest is None or band.received_minutes_ago is None:
                print(f"band {band.band}: no GOES-19 full-disk file found")
                stale = True
                continue
            if band.received_minutes_ago < -CLOCK_SKEW_MINUTES:
                # A file dated in the future would look fresh forever and hide a
                # stall, so a wrong clock counts as a failure.
                print(
                    f"band {band.band}: CLOCK - newest {band.newest} is dated "
                    f"{-band.received_minutes_ago:.0f} min in the future"
                )
                stale = True
                continue
            late = band.received_minutes_ago > args.max_age_minutes
            stale = stale or late
            arrived = max(band.received_minutes_ago, 0.0)
            print(
                f"band {band.band}: {'STALE' if late else 'ok'} - newest "
                f"{band.newest} arrived {arrived:.0f} min ago "
                f"(scan {band.scan_minutes_ago:.0f} min ago)"
            )
        return 1 if stale else 0
    try:
        client = None if args.dry_run else client_from_env()
        storage = Storage.from_env(
            {} if args.dry_run else os.environ, args.work_dir / "images"
        )
    except ConfigurationError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    result = collect(
        args.input_dir,
        args.work_dir,
        client,
        storage,
        bands=args.bands,
        max_files=args.max_files,
        coastlines=not args.no_coastlines,
        state_file=DRY_RUN_STATE_FILE if args.dry_run else STATE_FILE,
    )
    for path in result.archived:
        print(f"archived {path}")
    for failure in result.failed:
        print(f"failed {failure}", file=sys.stderr)
    return 1 if result.failed else 0
