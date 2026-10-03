"""Partial absence belongs to the roster shift's local start date."""

from datetime import date
from uuid import uuid4

import pytest

from src.hr.absentee.models import AbsenceReason
from src.hr.absentee.schemas import AbsenteeReportCreate
from src.hr.absentee.service import prepare_absentee_fields
from src.hr.exceptions import HRValidationError
from src.hr.roster.models import ShiftCatalog, ShiftCategory


async def test_absence_interval_fits_the_saturday_night_shift(db_async):
    shift = await db_async.get(ShiftCatalog, "N")
    if shift is None:
        db_async.add(
            ShiftCatalog(
                code="N",
                label="Night",
                category=ShiftCategory.WORK,
                start_time="22:30",
                end_time="06:00",
                ends_next_day=True,
            )
        )
        await db_async.flush()

    def payload(start, end):
        return AbsenteeReportCreate(
            user_id=uuid4(),
            department_id="gms",
            report_date=date(2026, 9, 26),
            reason=AbsenceReason.TIME_OFF,
            expected_shift_code="N",
            absence_start_time=start,
            absence_end_time=end,
        )

    for start, end in [("23:00", "01:00"), ("00:30", "05:00"), ("22:30", "06:00")]:
        item = payload(start, end)
        await prepare_absentee_fields(db_async, item)
        assert item.report_date == date(2026, 9, 26)
    for start, end in [("21:00", "23:00"), ("05:00", "07:00"), ("07:00", "07:00")]:
        with pytest.raises(HRValidationError):
            await prepare_absentee_fields(db_async, payload(start, end))
