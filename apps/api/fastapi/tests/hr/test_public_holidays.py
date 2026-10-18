"""Provisional Grenada public holidays: date rules, loading, editing, permission."""

from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.exceptions import AuthorizationError
from src.hr.exceptions import HRValidationError
from src.hr.roster.holidays import (
    PROVISIONAL_SOURCE,
    easter_sunday,
    provisional_holidays,
)
from src.hr.roster.schemas import PublicHolidayUpdate
from src.hr.roster.service import (
    list_public_holidays,
    load_provisional_holidays,
    update_public_holiday,
)
from tests.factories import make_user
from tests.utils.utils import random_email, random_lower_string


async def _superuser(db_async: AsyncSession) -> User:
    return await create_user(
        session=db_async,
        user_create=UserCreate(
            email=random_email(),
            username=f"hol_{random_lower_string()}",
            password="password123",
            first_name="Holiday",
            last_name="Admin",
            is_superuser=True,
        ),
    )


def test_easter_dates():
    assert easter_sunday(2026) == date(2026, 4, 5)
    assert easter_sunday(2027) == date(2027, 3, 28)


@pytest.mark.parametrize(
    ("year", "expected"),
    [
        (
            2026,
            {
                "Good Friday": date(2026, 4, 3),
                "Easter Monday": date(2026, 4, 6),
                "Whit Monday": date(2026, 5, 25),
                "Corpus Christi": date(2026, 6, 4),
                "Carnival Monday": date(2026, 8, 10),
                "Carnival Tuesday": date(2026, 8, 11),
            },
        ),
        (
            2027,
            {
                "Good Friday": date(2027, 3, 26),
                "Easter Monday": date(2027, 3, 29),
                "Whit Monday": date(2027, 5, 17),
                "Corpus Christi": date(2027, 5, 27),
                "Carnival Monday": date(2027, 8, 9),
                "Carnival Tuesday": date(2027, 8, 10),
            },
        ),
    ],
)
def test_movable_holidays(year, expected):
    found = {h.name: h.holiday_date for h in provisional_holidays(year)}
    assert len(found) == 13
    assert len(set(found.values())) == 13
    for name, when in expected.items():
        assert found[name] == when


def test_weekend_fixed_dates_are_flagged_not_moved():
    by_name = {h.name: h for h in provisional_holidays(2026)}
    assert by_name["Independence Day"].holiday_date == date(2026, 2, 7)
    assert by_name["Independence Day"].needs_verification
    assert not by_name["Good Friday"].needs_verification


async def test_load_provisional_is_idempotent_and_editable(db_async):
    admin = await _superuser(db_async)
    first = await load_provisional_holidays(
        session=db_async, current_user=admin, year=2026
    )
    assert len(first) == 13
    assert {h.source for h in first} == {PROVISIONAL_SOURCE}
    again = await load_provisional_holidays(
        session=db_async, current_user=admin, year=2026
    )
    assert again == []
    listed = await list_public_holidays(session=db_async, current_user=admin, year=2026)
    assert len(listed) == 13

    target = next(h for h in listed if h.name == "Independence Day")
    updated = await update_public_holiday(
        session=db_async,
        current_user=admin,
        holiday_id=target.id,
        payload=PublicHolidayUpdate(
            name="Independence Day",
            holiday_date=date(2026, 2, 9),
            source="GAA HR circular",
            needs_verification=False,
        ),
    )
    assert updated.holiday_date == date(2026, 2, 9)
    assert not updated.needs_verification

    other = next(h for h in listed if h.name == "Labour Day")
    with pytest.raises(HRValidationError):
        await update_public_holiday(
            session=db_async,
            current_user=admin,
            holiday_id=other.id,
            payload=PublicHolidayUpdate(
                name="Labour Day", holiday_date=date(2026, 2, 9)
            ),
        )


async def test_load_provisional_requires_admin_and_sane_year(db_async):
    plain = await make_user(db_async)
    with pytest.raises(AuthorizationError):
        await load_provisional_holidays(session=db_async, current_user=plain, year=2026)
    admin = await _superuser(db_async)
    with pytest.raises(HRValidationError):
        await load_provisional_holidays(session=db_async, current_user=admin, year=1850)
