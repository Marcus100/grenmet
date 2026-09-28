"""Organisation context shared by personnel and scoped access services."""

import uuid
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import RoleAssignmentScope, User, UserRoleAssignment
from src.exceptions import AppException
from src.hr.exceptions import DepartmentNotFoundError
from src.hr.models import Department, EmploymentRecord, EmploymentStatus, Organisation
from src.utils.datetime import utc_now


async def active_assignments(
    session: AsyncSession, user_id: uuid.UUID
) -> list[UserRoleAssignment]:
    now = utc_now()
    result = await session.execute(
        select(UserRoleAssignment).where(
            UserRoleAssignment.user_id == user_id,
            UserRoleAssignment.effective_from <= now,
            UserRoleAssignment.effective_to.is_(None)
            | (UserRoleAssignment.effective_to > now),
        )
    )
    return list(result.scalars().all())


async def organisation_choices(
    session: AsyncSession, actor: User
) -> list[Organisation]:
    statement = select(Organisation)
    if not actor.is_superuser:
        ids = {a.organisation_id for a in await active_assignments(session, actor.id)}
        employment = await session.scalar(
            select(EmploymentRecord).where(EmploymentRecord.user_id == actor.id)
        )
        if employment:
            ids.add(employment.organisation_id)
        from src.hr.documents.models import EmployeeDocument

        ids.update(
            (
                await session.execute(
                    select(EmployeeDocument.organisation_id).where(
                        EmployeeDocument.user_id == actor.id
                    )
                )
            )
            .scalars()
            .all()
        )
        from src.hr.training.models import TrainingRecord

        ids.update(
            (
                await session.execute(
                    select(TrainingRecord.organisation_id).where(
                        TrainingRecord.user_id == actor.id
                    )
                )
            )
            .scalars()
            .all()
        )
        statement = statement.where(Organisation.id.in_(ids))
    return list(
        (await session.execute(statement.order_by(Organisation.name))).scalars().all()
    )


async def resolve_organisation(
    session: AsyncSession, actor: User, organisation_id: str | None = None
) -> str:
    choices = {org.id for org in await organisation_choices(session, actor)}
    if organisation_id is not None:
        if organisation_id not in choices:
            raise AppException("Organisation access denied", 403)
        return organisation_id
    if len(choices) != 1:
        raise AppException("Select an organisation; context is not unique", 400)
    return next(iter(choices))


async def require_organisation_permission(
    session: AsyncSession,
    actor: User,
    organisation_id: str,
    key: str,
    department_id: str | None = None,
) -> None:
    if actor.is_superuser:
        return
    roles = {
        role.id
        for role in actor.roles
        if any(p.key.lower() == key.lower() for p in role.permissions)
    }
    for assignment in await active_assignments(session, actor.id):
        if (
            assignment.organisation_id != organisation_id
            or assignment.role_id not in roles
        ):
            continue
        if assignment.scope == RoleAssignmentScope.ALL:
            return
        if (
            department_id
            and assignment.scope == RoleAssignmentScope.DEPARTMENT
            and assignment.department_id == department_id
        ):
            return
    raise AppException("Insufficient scope for this organisation", 403)


async def department_for(session: AsyncSession, department_id: str) -> Department:
    department = await session.get(Department, department_id)
    if not department:
        raise DepartmentNotFoundError()
    return department


async def permitted_departments(
    session: AsyncSession, actor: User, organisation_id: str, key: str
) -> set[str]:
    departments = set(
        (
            await session.execute(
                select(Department.id).where(
                    Department.organisation_id == organisation_id
                )
            )
        )
        .scalars()
        .all()
    )
    if actor.is_superuser:
        return departments
    roles = {
        r.id
        for r in actor.roles
        if any(p.key.lower() == key.lower() for p in r.permissions)
    }
    employment = await session.scalar(
        select(EmploymentRecord).where(
            EmploymentRecord.user_id == actor.id,
            EmploymentRecord.organisation_id == organisation_id,
        )
    )
    permitted: set[str] = set()
    for assignment in await active_assignments(session, actor.id):
        if (
            assignment.organisation_id != organisation_id
            or assignment.role_id not in roles
        ):
            continue
        if assignment.scope == RoleAssignmentScope.ALL:
            return departments
        if (
            assignment.scope == RoleAssignmentScope.DEPARTMENT
            and assignment.department_id
        ):
            permitted.add(assignment.department_id)
        elif assignment.scope == RoleAssignmentScope.SELF and employment:
            permitted.add(employment.department_id)
    return permitted & departments


async def validate_supervisor(
    session: AsyncSession,
    supervisor_id: uuid.UUID | None,
    organisation_id: str,
    target_user_id: uuid.UUID | None = None,
) -> None:
    if supervisor_id is None:
        return
    employment = await session.scalar(
        select(EmploymentRecord)
        .join(User, User.id == EmploymentRecord.user_id)
        .where(
            EmploymentRecord.user_id == supervisor_id,
            EmploymentRecord.organisation_id == organisation_id,
            EmploymentRecord.status == EmploymentStatus.ACTIVE,
            User.is_active.is_(True),
        )
    )
    if employment is None:
        raise AppException(
            "Supervisor must be an active employee in the same organisation", 400
        )
    visited = {target_user_id} if target_user_id else set()
    cursor: uuid.UUID | None = supervisor_id
    while cursor:
        if cursor in visited:
            raise AppException(
                "Supervisor assignment would create a reporting cycle", 400
            )
        visited.add(cursor)
        record = await session.scalar(
            select(EmploymentRecord).where(EmploymentRecord.user_id == cursor)
        )
        cursor = record.supervisor_id if record else None


async def validate_service_facts(
    updates: dict[str, Any], employment: EmploymentRecord | None
) -> None:
    """Validate recorded HR facts without deriving service or leave eligibility."""

    def value(key: str) -> Any:
        return updates.get(key, getattr(employment, key, None))

    start = value("start_date")
    end = value("probation_end_date")
    completed = value("probation_completed_date")
    if start and any(day and day < start for day in (end, completed)):
        raise AppException(
            "Probation dates must not precede employment commencement", 400
        )
    if completed and completed > datetime.now(ZoneInfo("America/Grenada")).date():
        raise AppException(
            "Probation completion must be a recorded past or current date", 400
        )
    recorded = any(
        value(key) is not None
        for key in (
            "continuous_service_date",
            "probation_end_date",
            "probation_completed_date",
        )
    )
    source = value("service_details_source")
    if recorded and (not source or not source.strip()):
        raise AppException(
            "Provide the HR source for recorded service and probation facts", 400
        )
