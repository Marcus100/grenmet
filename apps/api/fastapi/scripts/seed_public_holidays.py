"""Seed a year of Grenada public holidays into hr.public_holiday.

The calendar's holiday layer reads this table; it starts empty, so without a
seed the layer is simply absent.

Movable feasts are computed from Easter (anonymous Gregorian computus), and the
August holidays from the nth-Monday rule, so the script is correct for any year
rather than a hardcoded list that rots. Fixed-date holidays are listed once.

IMPORTANT: Grenada's official holiday list is gazetted, and a holiday falling on
a weekend is sometimes observed on the following Monday by proclamation. This
script seeds the statutory dates only — it does not apply any observed-day
shift. Print the year with --dry-run and check it against the gazette before
running against staging or production.

Usage (from apps/api/fastapi):

    uv run --frozen --package fast-back python scripts/seed_public_holidays.py \
        --year 2026 --dry-run
    uv run --frozen --package fast-back python scripts/seed_public_holidays.py \
        --year 2026 --actor admin
"""

import argparse
import asyncio
import logging
import sys
from datetime import date, timedelta

from sqlmodel import col, select

from src.auth.models import User
from src.config import settings
from src.database import async_session_factory
from src.hr.roster.models import PublicHoliday

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

COUNTRY = "GD"


def easter_sunday(year: int) -> date:
    """Anonymous Gregorian computus."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    length = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * length) // 451
    month, day = divmod(h + length - 7 * m + 114, 31)
    return date(year, month, day + 1)


def nth_monday(year: int, month: int, n: int) -> date:
    day = date(year, month, 1)
    while day.weekday() != 0:
        day += timedelta(days=1)
    return day + timedelta(days=7 * (n - 1))


def holidays_for(year: int) -> list[tuple[str, date, bool]]:
    """(name, date, is_recurring) for one year, in calendar order.

    `is_recurring` marks a holiday that falls on the same calendar date every
    year; the movable feasts and the August Mondays do not.
    """
    easter = easter_sunday(year)
    entries: list[tuple[str, date, bool]] = [
        ("New Year's Day", date(year, 1, 1), True),
        ("Independence Day", date(year, 2, 7), True),
        ("Good Friday", easter - timedelta(days=2), False),
        ("Easter Monday", easter + timedelta(days=1), False),
        ("Labour Day", date(year, 5, 1), True),
        ("Whit Monday", easter + timedelta(days=50), False),
        ("Corpus Christi", easter + timedelta(days=60), False),
        ("Emancipation Day", nth_monday(year, 8, 1), False),
        ("Carnival Monday", nth_monday(year, 8, 2), False),
        ("Carnival Tuesday", nth_monday(year, 8, 2) + timedelta(days=1), False),
        ("Thanksgiving Day", date(year, 10, 25), True),
        ("Christmas Day", date(year, 12, 25), True),
        ("Boxing Day", date(year, 12, 26), True),
    ]
    return sorted(entries, key=lambda entry: entry[1])


async def run(year: int, actor_username: str, dry_run: bool) -> int:
    async with async_session_factory() as session:
        result = await session.execute(
            select(User).where(col(User.username) == actor_username)
        )
        actor = result.scalars().first()
        if actor is None or not actor.is_active or not actor.is_superuser:
            logger.error(
                "ABORT: no user account %r to attribute the seed to", actor_username
            )
            return 1

        created = skipped = 0
        for name, holiday_date, is_recurring in holidays_for(year):
            existing = await session.execute(
                select(PublicHoliday).where(
                    col(PublicHoliday.holiday_date) == holiday_date,
                    col(PublicHoliday.country_code) == COUNTRY,
                )
            )
            if existing.scalars().first() is not None:
                logger.info(
                    "EXISTS %s  %-18s %s",
                    holiday_date,
                    name,
                    holiday_date.strftime("%A"),
                )
                skipped += 1
                continue

            logger.info(
                "CREATE %s  %-18s %s",
                holiday_date,
                name,
                holiday_date.strftime("%A"),
            )
            if not dry_run:
                session.add(
                    PublicHoliday(
                        name=name,
                        holiday_date=holiday_date,
                        is_recurring=is_recurring,
                        country_code=COUNTRY,
                        created_by_user_id=actor.id,
                    )
                )
            created += 1

        if dry_run:
            await session.rollback()
            logger.info(
                "\nDRY RUN: would create %d, skip %d existing", created, skipped
            )
            logger.warning(
                "Check these against the gazette: a holiday falling on a weekend "
                "may be observed on the following Monday, which this script does "
                "not apply."
            )
        else:
            await session.commit()
            logger.info("\nDone: created %d, skipped %d existing", created, skipped)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--actor", default="admin")
    parser.add_argument(
        "--environment", required=True, choices=("local", "staging", "production")
    )
    parser.add_argument(
        "--reviewed",
        action="store_true",
        help="Dates checked against the official calendar",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.environment != settings.ENVIRONMENT:
        parser.error("Requested environment does not match configured environment")
    if args.apply and settings.ENVIRONMENT != "local" and not args.reviewed:
        parser.error(
            "Check these dates against the official calendar and use --reviewed"
        )
    return asyncio.run(run(args.year, args.actor, not args.apply))


if __name__ == "__main__":
    sys.exit(main())
