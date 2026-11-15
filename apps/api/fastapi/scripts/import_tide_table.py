"""Import the owner's predicted tide table (CSV) into ``almanac.tide_prediction``.

The file is the owner's Prickly Bay tide export. It is read from the path you give
and is never copied into the repository. Re-running the same file changes nothing;
a corrected file replaces the heights and times it shares with the database.

    uv run --frozen --package fast-back python -m scripts.import_tide_table \\
        /path/to/pric-tides-2027-01-01-to-2027-12-31.csv --source-version v1.5 \\
        --expect-from 2027-01-01 --expect-to 2027-12-31 --dry-run

``--dry-run`` reads and checks the file only: counts, first and last events (UTC and
AST), events per month, gaps and missing dates. It needs no database. Without it the
same summary is printed and a file that fails any check is refused before writing.

Heights are stored in metres relative to provisional MLLW. The data is predicted and
provisional, not for navigation.
"""

import argparse
import asyncio
import sys
from datetime import date
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
    TideTableSummary,
    parse_tide_csv,
    summarize_tides,
    to_ast,
)

#: How many gaps, missing dates or duplicates the report lists before it stops.
MAX_LISTED = 10


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
        "--expect-from",
        type=date.fromisoformat,
        default=None,
        help="AST date the file must start on or before (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--expect-to",
        type=date.fromisoformat,
        default=None,
        help="AST date the file must end on or after (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Check and summarise the file; connect to nothing and write nothing",
    )
    parser.add_argument(
        "--confirm-host",
        default=None,
        help="Required when the database host is not local: repeat the host name",
    )
    return parser


async def _run(rows: list[TideRow]) -> int:
    # Imported here so a dry run never touches the database settings or engine.
    from src.database import async_session_factory

    async with async_session_factory() as session:
        return await service.upsert_tides(session, rows)


def _event(row: TideRow) -> str:
    local = to_ast(row.time_utc)
    return (
        f"{row.event_type:<4} {row.time_utc:%Y-%m-%d %H:%M} UTC"
        f" ({local:%Y-%m-%d %H:%M} AST)  {row.height_m_mllw} m"
    )


def format_summary(summary: TideTableSummary) -> str:
    """The plain-text report printed before any write."""
    months = ", ".join(
        f"{month} {count}" for month, count in summary.per_month_ast.items()
    )
    lines = [
        f"events: {summary.count} ({summary.highs} high, {summary.lows} low,"
        f" {summary.near_flat} near-flat)",
        f"AST dates: {summary.first_date_ast} to {summary.last_date_ast}",
        f"first: {_event(summary.first)}",
        f"last:  {_event(summary.last)}",
        f"per month (AST): {months}",
    ]
    if summary.same_type_neighbours:
        lines.append(
            f"note: {summary.same_type_neighbours} consecutive same-type pairs"
            " (allowed; they should be near-flat events)"
        )
    lines.extend(
        f"gap: {gap.hours:.1f} h between {gap.after:%Y-%m-%d %H:%M}"
        f" and {gap.before:%Y-%m-%d %H:%M} UTC"
        for gap in summary.gaps[:MAX_LISTED]
    )
    lines.extend(
        f"missing AST date: {day}" for day in summary.missing_dates_ast[:MAX_LISTED]
    )
    lines.extend(
        f"duplicate time: {time:%Y-%m-%d %H:%M} UTC"
        for time in summary.duplicate_times[:MAX_LISTED]
    )
    lines.extend(f"error: {error}" for error in summary.errors)
    lines.append("checks: passed" if summary.ok else "checks: FAILED")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        with args.csv_path.open(encoding="utf-8", newline="") as handle:
            rows = parse_tide_csv(
                handle, station_key=args.station, source_version=args.source_version
            )
        summary = summarize_tides(
            rows, expect_from=args.expect_from, expect_to=args.expect_to
        )
    except (OSError, TideTableError) as error:
        print(f"import failed: {error}", file=sys.stderr)
        return 1
    print(f"file: {args.csv_path.name} ({args.station}, {args.source_version})")
    print(format_summary(summary))
    if args.dry_run:
        print("dry run: nothing written")
        return 0 if summary.ok else 1
    if not summary.ok:
        print("import refused: the file failed the checks above", file=sys.stderr)
        return 1
    host, database = describe_target()
    print(f"target database: {database or '(default)'} on {host}")
    try:
        require_confirmed(host, args.confirm_host)
    except TargetNotConfirmedError as error:
        print(error, file=sys.stderr)
        return 2
    count = asyncio.run(_run(rows))
    print(
        f"imported {count} predicted tide events for {args.station} ({args.source_version})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
