import uuid

import pytest
from sqlmodel import Session

from src.hr.dependencies import (
    get_roster_period_or_404,
    get_timesheet_or_404,
)
from src.hr.exceptions import RosterPeriodNotFoundError, TimesheetNotFoundError


def test_get_timesheet_or_404_raises_not_found(db: Session) -> None:
    with pytest.raises(TimesheetNotFoundError):
        get_timesheet_or_404(session=db, timesheet_id=uuid.uuid4())


def test_get_roster_period_or_404_raises_not_found(db: Session) -> None:
    with pytest.raises(RosterPeriodNotFoundError):
        get_roster_period_or_404(session=db, period_id=uuid.uuid4())
