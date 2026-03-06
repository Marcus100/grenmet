import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.hr.dependencies import (
    get_roster_period_or_404,
    get_timesheet_or_404,
)
from src.hr.exceptions import RosterPeriodNotFoundError, TimesheetNotFoundError


async def test_get_timesheet_or_404_raises_not_found(
    db_async: AsyncSession,
) -> None:
    with pytest.raises(TimesheetNotFoundError):
        await get_timesheet_or_404(
            session=db_async, timesheet_id=uuid.uuid4()
        )


async def test_get_roster_period_or_404_raises_not_found(
    db_async: AsyncSession,
) -> None:
    with pytest.raises(RosterPeriodNotFoundError):
        await get_roster_period_or_404(
            session=db_async, period_id=uuid.uuid4()
        )
