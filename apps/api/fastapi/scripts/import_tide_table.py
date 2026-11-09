"""Import the owner's predicted tide table (CSV) into ``almanac.tide_prediction``.

The file is the owner's Prickly Bay tide export. It is read from the path you give
and is never copied into the repository. Re-running the same file changes nothing;
a corrected file replaces the heights and times it shares with the database.

    uv run --frozen --package fast-back python scripts/import_tide_table.py \\
        /path/to/pric-tides-2026-10-01-to-2026-12-31.csv --source-version v1.4

Heights are stored in metres relative to provisional MLLW. The data is predicted and
provisional, not for navigation.
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.almanac import service  # noqa: E402
from src.almanac.tides import (  # noqa: E402
    TIDE_STATIONS,
    TideRow,
    TideTableError,
    parse_tide_csv,
)
from src.database import async_session_factory  # noqa: E402


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
    return parser


async def _run(rows: list[TideRow]) -> int:
    async with async_session_factory() as session:
        return await service.upsert_tides(session, rows)


def main() -> int:
    args = _parser().parse_args()
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
