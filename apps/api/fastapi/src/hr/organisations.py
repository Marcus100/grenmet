"""Organisation context shared by personnel and scoped access services."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.auth.models import RoleAssignmentScope, User, UserRoleAssignment
from src.exceptions import AppException
from src.hr.exceptions import DepartmentNotFoundError
from src.hr.models import Department, EmploymentRecord, Organisation
from src.utils.datetime import utc_now


async def active_assignments(
    session: AsyncSession, user_id: uuid.UUID
) -> list[UserRoleAssignment]:
    now = utc_now()
    result = await session.execute(
        select(UserRoleAssignment).where(
            UserRoleAssignment.user_id == user_id,
            col(UserRoleAssignment.effective_from) <= now,
            col(UserRoleAssignment.effective_to).is_(None)
            | (col(UserRoleAssignment.effective_to) > now),
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
        statement = statement.where(col(Organisation.id).in_(ids))
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
    session: AsyncSession, supervisor_id: uuid.UUID | None, organisation_id: str
) -> None:
    if supervisor_id is None:
        return
    employment = await session.scalar(
        select(EmploymentRecord).where(
            EmploymentRecord.user_id == supervisor_id,
            EmploymentRecord.organisation_id == organisation_id,
        )
    )
    if employment is None:
        raise AppException("Supervisor must be employed in the same organisation", 400)
