"""Remove a former employee's date of birth and address once the retention period ends.

Owner decision, 14 Nov 2026 (ADR-0058 section 7, issue #1431). Account deletion
anonymises the account and, for a person with an employment record, keeps the date of
birth (``hr.user_profile``) and the ``hr.user_address`` row for statutory pay and NIS
records. This job removes both once the person's latest employment ended more than
``FORMER_STAFF_PERSONAL_DETAILS_RETENTION_YEARS`` before today (Grenada date).

Only anonymised accounts are touched (the same markers as ``auth.service.is_anonymised``),
and only when every employment record has an end date. Employment, pay, leave and
attendance rows are never changed. Core statements, not ORM changes: the HR audit
tracks these tables, and an ORM change would copy the old values into the audit trail.
Idempotent (a cleared account is no longer a candidate) and batched.
"""

import logging
import uuid
from datetime import date

from sqlalchemy import Select, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit
from src.auth import placeholders
from src.auth.models import User
from src.auth.utils import ANONYMISED_PASSWORD_MARKER
from src.hr.constants import FORMER_STAFF_PERSONAL_DETAILS_RETENTION_YEARS
from src.hr.models import EmploymentRecord, UserAddress, UserProfile
from src.utils.datetime import utc_now
from src.utils.timezones import local_today

logger = logging.getLogger(__name__)

BATCH_SIZE = 200


def retention_cutoff(today: date) -> date:
    """Employment that ended before this date is past the period. 29 February clamps
    to 28 February."""
    year = today.year - FORMER_STAFF_PERSONAL_DETAILS_RETENTION_YEARS
    try:
        return today.replace(year=year)
    except ValueError:
        return today.replace(year=year, day=28)


def _eligible_user_ids(cutoff: date, limit: int) -> Select[tuple[uuid.UUID]]:
    # Every employment record has an end date, and the latest is past the cutoff.
    ended_long_ago = (
        select(EmploymentRecord.user_id)
        .group_by(EmploymentRecord.user_id)
        .having(
            func.count(EmploymentRecord.id) == func.count(EmploymentRecord.end_date),
            func.max(EmploymentRecord.end_date) < cutoff,
        )
    )
    has_dob = select(UserProfile.user_id).where(UserProfile.date_of_birth.is_not(None))
    has_address = select(UserAddress.user_id)
    return (
        select(User.id)
        .where(
            User.id.in_(ended_long_ago),
            User.id.in_(has_dob.union(has_address)),
            User.is_active.is_(False),
            User.hashed_password == ANONYMISED_PASSWORD_MARKER,
            func.lower(User.email).like(
                f"{placeholders.PLACEHOLDER_PREFIX}%@{placeholders.PLACEHOLDER_DOMAIN}"
            ),
            func.lower(User.username).like(f"{placeholders.PLACEHOLDER_PREFIX}%"),
        )
        .order_by(User.id)
        .limit(limit)
    )


async def clear_expired_personal_details(
    session: AsyncSession, *, today: date | None = None
) -> int:
    """Clear date of birth and address for every account past the period. Returns the
    number of accounts cleared. Each batch commits on its own."""
    cutoff = retention_cutoff(today or local_today())
    total = 0
    while True:
        user_ids = list(
            (await session.scalars(_eligible_user_ids(cutoff, BATCH_SIZE))).all()
        )
        if not user_ids:
            break
        now = utc_now()
        audit.set_actor(session, None)
        await session.execute(
            update(UserProfile)
            .where(UserProfile.user_id.in_(user_ids))
            .values(date_of_birth=None, updated_at=now)
        )
        await session.execute(
            delete(UserAddress).where(UserAddress.user_id.in_(user_ids))
        )
        for user_id in user_ids:
            await audit.record_change(
                session,
                entity_type="account",
                entity_id=str(user_id),
                record_type="hr_retention_cleanup",
                record_id=str(user_id),
                action="cleared",
                changes={"retention": (None, "date_of_birth_and_address_cleared")},
            )
        await session.commit()
        total += len(user_ids)
        if len(user_ids) < BATCH_SIZE:
            break
    logger.info("HR retention cleanup finished", extra={"accounts_cleared": total})
    return total
