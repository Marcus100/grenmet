"""Import the owner's predicted tide table (CSV) into ``almanac.tide_prediction``.

The file is the owner's Prickly Bay tide export. It is read from the path you give
and is never copied into the repository. Re-running the same file changes nothing;
a corrected file replaces the heights and times it shares with the database.

    uv run --frozen --package fast-back python -m scripts.import_tide_table \\
        /path/to/pric-tides-2026-10-01-to-2026-12-31.csv --source-version v1.4

Heights are stored in metres relative to provisional MLLW. The data is predicted and
provisional, not for navigation.
"""

import argparse
import asyncio
import sys
from pathlib import Path

from src.almanac import service
from src.almanac.target import (
    TargetNotConfirmedError,
    describe_target,
    require_confirmed,
)
from src.almanac.tides import (
    TIDE_STATIONS,
    TideRow,
    TideTableError,
    parse_tide_csv,
)
from src.database import async_session_factory


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("csv_path", type=Path, help="Path to the tide CSV (read only)")
    parser.add_argument(
        "--station",
        default="pric",
        choices=sorted(TIDE_STATIONS),
        help="Station key (default: pric, Prickly Bay)",
    )
    parser.add_argument(
        "--source-version",
        default="v1.4",
        help="Version label of the owner's table (default: v1.4)",
    )
    parser.add_argument(
        "--confirm-host",
        default=None,
        help="Required when the database host is not local: repeat the host name",
    )
    return parser


async def _run(rows: list[TideRow]) -> int:
    async with async_session_factory() as session:
        return await service.upsert_tides(session, rows)


def main() -> int:
    args = _parser().parse_args()
    host, database = describe_target()
    print(f"target database: {database or '(default)'} on {host}")
    try:
        require_confirmed(host, args.confirm_host)
    except TargetNotConfirmedError as error:
        print(error, file=sys.stderr)
        return 2
    try:
        with args.csv_path.open(encoding="utf-8", newline="") as handle:
            rows = parse_tide_csv(
                handle, station_key=args.station, source_version=args.source_version
            )
    except (OSError, TideTableError) as error:
        print(f"import failed: {error}", file=sys.stderr)
        return 1
    count = asyncio.run(_run(rows))
    print(
        f"imported {count} predicted tide events for {args.station} ({args.source_version})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
