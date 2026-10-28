"""Command line: `render` one file offline, or `collect` one bounded pass."""

import argparse
import os
import sys
from pathlib import Path

from gnc_collector.archive import ConfigurationError, Storage, client_from_env
from gnc_collector.collector import collect
from gnc_collector.goes import CARIBBEAN, parse_name
from gnc_collector.render import BANDS, render


def parse_bands(value: str) -> list[int]:
    bands = [int(part) for part in value.split(",") if part]
    unknown = sorted(set(bands) - set(BANDS))
    if unknown:
        raise argparse.ArgumentTypeError(
            f"unsupported band(s) {unknown}; supported: {sorted(BANDS)}"
        )
    return bands


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="gnc-collector", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    one = commands.add_parser("render", help="render one ABI CMIP file to a PNG")
    one.add_argument("file", type=Path)
    one.add_argument("--output", type=Path, required=True)
    one.add_argument("--no-coastlines", action="store_true")

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
    )
    for path in result.archived:
        print(f"archived {path}")
    for failure in result.failed:
        print(f"failed {failure}", file=sys.stderr)
    return 1 if result.failed else 0
