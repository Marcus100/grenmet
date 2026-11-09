"""Build one year of the almanac: sun, twilight and moon rows, and principal phases.

Run it once a year (before 1 January) and after changing a location. Re-running is
safe: rows are upserted and the year's phases are replaced.

    uv run --frozen --package fast-back python scripts/build_almanac_year.py --year 2027
    uv run --frozen --package fast-back python scripts/build_almanac_year.py --year 2027 --location mbia

Writes to the database that ``DATABASE_URL``/``POSTGRES_*`` point at. Nothing is
fetched from the network: the values are computed locally with Astral.
"""

import argparse
import asyncio
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.almanac import service  # noqa: E402
from src.almanac.locations import LOCATIONS  # noqa: E402
from src.database import async_session_factory  # noqa: E402


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--year", type=int, required=True, help="Calendar year, e.g. 2027"
    )
    parser.add_argument(
        "--location",
        action="append",
        choices=sorted(LOCATIONS),
        help="Location key (repeatable). Default: all locations.",
    )
    return parser


async def _run(year: int, locations: list[str]) -> None:
    async with async_session_factory() as session:
        for key in locations:
            count = await service.store_astronomy(
                session, key, date(year, 1, 1), date(year, 12, 31)
            )
            print(f"{key}: {count} day rows for {year}")
        phases = await service.store_phase_events(session, year, year)
        print(f"principal phases dated in {year}: {phases}")


def main() -> int:
    args = _parser().parse_args()
    locations = args.location or sorted(LOCATIONS)
    asyncio.run(_run(args.year, locations))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
