import logging
import uuid
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.auth.models import RoleAssignmentScope, User
from src.exceptions import AppException
from src.hr import organisations
from src.hr.models import Department, EmploymentRecord
from src.utils.datetime import utc_now

from .models import TrainingRecord
from .schemas import (
    TrainingArchiveInput,
    TrainingEmployeeList,
    TrainingEmployeePublic,
    TrainingRecordInput,
    TrainingRecordList,
    TrainingRecordPublic,
)

logger = logging.getLogger(__name__)


@dataclass
class Access:
    organisation_id: str
    actor_id: uuid.UUID
    readable: set[str]
    managed: set[str]

    def can_manage(self, record: TrainingRecord) -> bool:
        return (
            record.organisation_id == self.organisation_id
            and record.department_id in self.managed
        )


async def resolve_access(
    session: AsyncSession, actor: User, organisation_id: str
) -> Access:
    organisation_id = await organisations.resolve_organisation(
        session, actor, organisation_id
    )
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
        return Access(organisation_id, actor.id, departments, departments)
    roles = {
        role.id: {permission.key for permission in role.permissions}
        for role in actor.roles
    }
    readable: set[str] = set()
    managed: set[str] = set()
    for assignment in await organisations.active_assignments(session, actor.id):
        if assignment.organisation_id != organisation_id:
            continue
        # SELF never becomes department-wide access, even with a manager key.
        targets = (
            departments
            if assignment.scope == RoleAssignmentScope.ALL
            else (
                {assignment.department_id} & departments
                if assignment.scope == RoleAssignmentScope.DEPARTMENT
                and assignment.department_id
                else set()
            )
        )
        keys = roles.get(assignment.role_id, set())
        if "hr.training.manage" in keys:
            managed.update(targets)
        if "hr.training.read.department" in keys:
            readable.update(targets)
    return Access(organisation_id, actor.id, readable | managed, managed)


async def create_record(
    *, session: AsyncSession, actor: User, payload: TrainingRecordInput
) -> TrainingRecord:
    access = await resolve_access(session, actor, payload.organisation_id)
    employment = await session.scalar(
        select(EmploymentRecord).where(
            EmploymentRecord.user_id == payload.user_id,
            EmploymentRecord.organisation_id == access.organisation_id,
        )
    )
    if employment is None or employment.department_id not in access.managed:
        raise AppException("Training management access denied for this employee", 403)
    if payload.completed_on > datetime.now(ZoneInfo("America/Grenada")).date():
        raise AppException("Training history cannot be dated in the future", 400)
    record = TrainingRecord(
        **payload.model_dump(),
        department_id=employment.department_id,
        created_by=actor.id,
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)
    logger.info("Training record created", extra={"training_record_id": str(record.id)})
    return record


async def list_records(
    *,
    session: AsyncSession,
    actor: User,
    organisation_id: str,
    user_id: uuid.UUID | None,
    include_archived: bool,
    page: int,
    size: int,
) -> TrainingRecordList:
    access = await resolve_access(session, actor, organisation_id)
    subject = user_id or actor.id
    query = select(TrainingRecord).where(
        TrainingRecord.organisation_id == access.organisation_id,
        TrainingRecord.user_id == subject,
        or_(
            col(TrainingRecord.user_id) == actor.id,
            col(TrainingRecord.department_id).in_(access.readable),
        ),
    )
    if not include_archived:
        query = query.where(col(TrainingRecord.archived_at).is_(None))
    count = await session.scalar(select(func.count()).select_from(query.subquery()))
    records = (
        (
            await session.execute(
                query.order_by(
                    col(TrainingRecord.completed_on).desc(),
                    col(TrainingRecord.created_at).desc(),
                    col(TrainingRecord.id),
                )
                .offset((page - 1) * size)
                .limit(size)
            )
        )
        .scalars()
        .all()
    )
    employment = await session.scalar(
        select(EmploymentRecord).where(
            EmploymentRecord.user_id == subject,
            EmploymentRecord.organisation_id == access.organisation_id,
        )
    )
    return TrainingRecordList(
        data=[
            TrainingRecordPublic.model_validate(
                record, from_attributes=True
            ).model_copy(update={"can_manage": access.can_manage(record)})
            for record in records
        ],
        count=count or 0,
        page=page,
        size=size,
        can_create=bool(employment and employment.department_id in access.managed),
    )


async def list_employees(
    *,
    session: AsyncSession,
    actor: User,
    organisation_id: str,
    search: str,
    page: int,
    size: int,
) -> TrainingEmployeeList:
    access = await resolve_access(session, actor, organisation_id)
    historical_users = select(TrainingRecord.user_id).where(
        TrainingRecord.organisation_id == access.organisation_id,
        or_(
            col(TrainingRecord.department_id).in_(access.readable),
            col(TrainingRecord.user_id) == actor.id,
        ),
    )
    query = (
        select(User, EmploymentRecord.department_id, EmploymentRecord.organisation_id)
        .outerjoin(EmploymentRecord, col(EmploymentRecord.user_id) == User.id)
        .where(
            or_(
                col(User.id).in_(historical_users),
                (col(EmploymentRecord.organisation_id) == access.organisation_id)
                & or_(
                    col(User.id) == actor.id,
                    col(EmploymentRecord.department_id).in_(access.readable),
                ),
            )
        )
    )
    if search.strip():
        query = query.where(
            func.concat(User.first_name, " ", User.last_name).icontains(
                search.strip(), autoescape=True
            )
        )
    count = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        await session.execute(
            query.order_by(col(User.last_name), col(User.first_name), col(User.id))
            .offset((page - 1) * size)
            .limit(size)
        )
    ).all()
    return TrainingEmployeeList(
        data=[
            TrainingEmployeePublic(
                user_id=user.id,
                name=f"{user.first_name or ''} {user.last_name or ''}".strip()
                or "Unnamed employee",
                department_id=(
                    department_id
                    if employee_org == access.organisation_id
                    and (user.id == actor.id or department_id in access.readable)
                    else "Historical records"
                ),
                can_create=employee_org == access.organisation_id
                and department_id in access.managed,
            )
            for user, department_id, employee_org in rows
        ],
        count=count or 0,
        page=page,
        size=size,
    )


async def archive_record(
    *,
    session: AsyncSession,
    actor: User,
    record_id: uuid.UUID,
    payload: TrainingArchiveInput,
) -> TrainingRecord:
    record = await session.scalar(
        select(TrainingRecord)
        .where(TrainingRecord.id == record_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if record is None:
        raise AppException("Training record not found", 404)
    access = await resolve_access(session, actor, record.organisation_id)
    if not access.can_manage(record):
        raise AppException("Training record not found", 404)
    if record.archived_at is None:
        record.archived_at = utc_now()
        record.archived_by = actor.id
        record.archive_reason = payload.reason
        session.add(record)
        await session.commit()
        await session.refresh(record)
        logger.info(
            "Training record archived", extra={"training_record_id": str(record.id)}
        )
    return record
