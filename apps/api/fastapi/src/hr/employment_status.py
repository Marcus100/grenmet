"""Employment status changes and the roles they end (#797).

Every status change that is not a plain record edit goes through
``set_employment_status``: the HR employment route, staff offboarding and the
daily job that ends records past their end date. So the rule "a change of
status ends the person's roles in that organisation" lives in one place.

Roles that end here are never revived by reinstating: ``reinstate`` is just
another status change, and the baseline SELF-scope staff role is kept by
``end_assignments_for_employment``.
"""

import logging
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.assignments import end_assignments_for_employment
from src.hr.models import EmploymentRecord, EmploymentStatus
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)


async def set_employment_status(
    *,
    session: AsyncSession,
    employment: EmploymentRecord,
    status: EmploymentStatus,
    organisation_wide: bool,
) -> bool:
    """Move a record to ``status``; any change ends the person's roles there.

    Returns False and does nothing when the status is already ``status``. Does
    not commit: the caller owns the transaction, so the status and the role
    endings land together. ``organisation_wide`` is passed through to
    ``end_assignments_for_employment`` and must be decided by the caller: a
    department-scope actor must not end organisation-wide (ALL) roles (#794).
    """
    if employment.status == status:
        return False
    employment.status = status
    employment.updated_at = utc_now()
    session.add(employment)
    await end_assignments_for_employment(
        session=session,
        user_id=employment.user_id,
        organisation_id=employment.organisation_id,
        organisation_wide=organisation_wide,
    )
    return True


async def end_due_employments(session: AsyncSession, *, today: date) -> int:
    """End every ACTIVE record whose last day is before ``today`` (#797).

    The last day itself is still a working day: roles end at midnight Grenada
    time. Records are locked (rows another run has locked are skipped) and ended
    as TERMINATED with organisation-wide authority, since no person decides this.
    Each record runs in its own savepoint, so one failure leaves the others
    committed; failures are logged by record id and re-raised after the commit so
    the run is reported as failed. Only ACTIVE records match, so a second run
    changes nothing. Returns the number of records ended.
    """
    due = (
        await session.scalars(
            select(EmploymentRecord)
            .where(
                EmploymentRecord.status == EmploymentStatus.ACTIVE,
                EmploymentRecord.end_date.is_not(None),
                EmploymentRecord.end_date < today,
            )
            .with_for_update(skip_locked=True)
        )
    ).all()
    ended = 0
    failed = 0
    for record in due:
        # Read before the savepoint: a rolled-back record is expired, and reading
        # it afterwards would need IO outside the session's greenlet.
        employment_id = str(record.id)
        try:
            async with session.begin_nested():
                await set_employment_status(
                    session=session,
                    employment=record,
                    status=EmploymentStatus.TERMINATED,
                    organisation_wide=True,
                )
        except Exception:
            failed += 1
            logger.exception(
                "Employment end failed for one record; the others continue",
                extra={"employment_id": employment_id},
            )
            continue
        ended += 1
    await session.commit()
    if failed:
        raise RuntimeError(
            f"{failed} employment record(s) could not be ended; {ended} were committed"
        )
    return ended
