"""Role assignments and delegated authority."""

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.email_verification import require_verified_email
from src.auth.models import (
    Role,
    RoleAssignmentScope,
    User,
    UserRoleAssignment,
)
from src.auth.roles import get_role
from src.auth.schemas import (
    UserRoleAssignmentCreate,
    UserRoleAssignmentUpdate,
)
from src.exceptions import AppException
from src.utils.datetime import utc_now


async def delete_user_role_assignment(
    *, session: AsyncSession, db_assignment: UserRoleAssignment
) -> None:
    """Revoke the assignment and remove legacy fallback when the last grant ends."""
    from src.auth.models import UserRoleLink

    await audit_assignment(session, db_assignment, "DELETE")
    await session.delete(db_assignment)
    await session.flush()
    remaining = (
        await session.execute(
            select(UserRoleAssignment.id).where(
                UserRoleAssignment.user_id == db_assignment.user_id,
                UserRoleAssignment.role_id == db_assignment.role_id,
            )
        )
    ).first()
    if remaining is None:
        await session.execute(
            delete(UserRoleLink).where(
                UserRoleLink.user_id == db_assignment.user_id,
                UserRoleLink.role_id == db_assignment.role_id,
            )
        )
    await session.commit()


async def create_user_role_assignment(
    *,
    session: AsyncSession,
    assignment_in: UserRoleAssignmentCreate,
    current_user: User | None = None,
) -> UserRoleAssignment:
    from src.hr.models import EmploymentRecord, Organisation
    from src.hr.organisations import department_for

    data = assignment_in.model_dump()
    employment = await session.scalar(
        select(EmploymentRecord).where(
            EmploymentRecord.user_id == assignment_in.user_id
        )
    )
    department = (
        await department_for(session, assignment_in.department_id)
        if assignment_in.department_id
        else None
    )
    organisation_id = assignment_in.organisation_id or (
        department.organisation_id
        if department
        else employment.organisation_id
        if employment
        else None
    )
    if organisation_id is None:
        choices = list((await session.execute(select(Organisation.id))).scalars().all())
        if len(choices) != 1:
            raise AppException(
                "Select an organisation; assignment ownership is ambiguous", 400
            )
        organisation_id = choices[0]
    if await session.get(Organisation, organisation_id) is None:
        raise AppException("Organisation not found", 404)
    if department and department.organisation_id != organisation_id:
        raise AppException("Department belongs to another organisation", 400)
    if assignment_in.scope == RoleAssignmentScope.DEPARTMENT and department is None:
        if not employment or employment.organisation_id != organisation_id:
            raise AppException("Department scope requires an explicit department", 400)
        data["department_id"] = employment.department_id
    data["organisation_id"] = organisation_id
    db_assignment = UserRoleAssignment(**data)
    role = await get_role(session=session, role_id=assignment_in.role_id)
    target = await session.get(User, assignment_in.user_id)
    if role is None or target is None:
        raise AppException("Role or user not found", 404)
    from src.auth.delegation import DEPARTMENT_AUTHORITY_ROLES

    if (
        role.name in DEPARTMENT_AUTHORITY_ROLES
        and db_assignment.scope != RoleAssignmentScope.DEPARTMENT
    ):
        raise AppException("Managers require an explicit department appointment", 400)
    if current_user is not None and (
        employment is None or employment.organisation_id != organisation_id
    ):
        raise AppException(
            "Place the target in this employer before assigning HR access", 400
        )
    if (
        employment is not None
        and db_assignment.scope == RoleAssignmentScope.DEPARTMENT
        and db_assignment.department_id != employment.department_id
    ):
        raise AppException("Target must belong to the appointed department", 400)
    if db_assignment.effective_to and db_assignment.effective_to <= utc_now():
        raise AppException("Expiry must be in the future", 400)
    if current_user is not None:
        await require_assignment_management(session, current_user, db_assignment)
        if not current_user.is_superuser:
            source = await delegation_authority(
                session, current_user, db_assignment, require_active_target=True
            )
            db_assignment.authority_assignment_id = source.id
            if source.effective_to and (
                db_assignment.effective_to is None
                or db_assignment.effective_to > source.effective_to
            ):
                db_assignment.effective_to = source.effective_to
        from src.audit.service import set_actor

        set_actor(session, current_user.id)
    # After the caller's authority checks, so an unauthorised caller learns
    # nothing about whether the target's email is verified.
    require_verified_email(target, "receive a staff role")
    session.add(db_assignment)
    await audit_assignment(session, db_assignment, "CREATE")
    await session.commit()
    await session.refresh(db_assignment)
    return db_assignment


async def update_user_role_assignment(
    *,
    session: AsyncSession,
    db_assignment: UserRoleAssignment,
    assignment_in: UserRoleAssignmentUpdate,
    current_user: User | None = None,
) -> UserRoleAssignment:
    if current_user is not None:
        await require_assignment_management(session, current_user, db_assignment)
    assignment_data = assignment_in.model_dump(exclude_unset=True)
    if "scope" in assignment_data and assignment_data["scope"] is None:
        raise AppException("Scope cannot be null", 400)
    from src.hr.organisations import department_for

    destination_id = assignment_data.get("department_id", db_assignment.department_id)
    if destination_id:
        destination = await department_for(session, destination_id)
        if destination.organisation_id != db_assignment.organisation_id:
            raise AppException("Department belongs to another organisation", 400)
    if (
        assignment_data.get("scope", db_assignment.scope)
        == RoleAssignmentScope.DEPARTMENT
        and not destination_id
    ):
        raise AppException("Department scope requires an explicit department", 400)
    candidate = UserRoleAssignment(
        **{
            column.key: getattr(db_assignment, column.key)
            for column in UserRoleAssignment.__table__.columns
        }
    )
    for key, value in assignment_data.items():
        setattr(candidate, key, value)
    if candidate.effective_to and candidate.effective_to <= utc_now():
        raise AppException("Expiry must be in the future", 400)
    from src.auth.delegation import DEPARTMENT_AUTHORITY_ROLES

    role = await get_role(session=session, role_id=candidate.role_id)
    if (
        role
        and role.name in DEPARTMENT_AUTHORITY_ROLES
        and candidate.scope != RoleAssignmentScope.DEPARTMENT
    ):
        raise AppException("Managers require an explicit department appointment", 400)
    if current_user is not None:
        await require_assignment_management(session, current_user, candidate)
        if not current_user.is_superuser:
            source = await delegation_authority(
                session, current_user, candidate, require_active_target=True
            )
            assignment_data["authority_assignment_id"] = source.id
            if source.effective_to and (
                candidate.effective_to is None
                or candidate.effective_to > source.effective_to
            ):
                assignment_data["effective_to"] = source.effective_to
        from src.audit.service import set_actor

        set_actor(session, current_user.id)
    for key, value in assignment_data.items():
        setattr(db_assignment, key, value)
    session.add(db_assignment)
    await audit_assignment(session, db_assignment, "UPDATE")
    await session.commit()
    await session.refresh(db_assignment)
    return db_assignment


async def get_user_role_assignment(
    *, session: AsyncSession, assignment_id: uuid.UUID
) -> UserRoleAssignment | None:
    statement = select(UserRoleAssignment).where(UserRoleAssignment.id == assignment_id)
    result = await session.execute(statement)
    return result.scalars().first()


async def get_user_role_assignments(
    *,
    session: AsyncSession,
    user_id: uuid.UUID | None = None,
    current_user: User | None = None,
) -> list[UserRoleAssignment]:
    statement = select(UserRoleAssignment)
    if user_id:
        statement = statement.where(UserRoleAssignment.user_id == user_id)
    result = await session.execute(statement)
    assignments = list(result.scalars().all())
    if current_user is None or current_user.is_superuser:
        return assignments
    allowed = []
    for assignment in assignments:
        try:
            await require_assignment_management(session, current_user, assignment)
        except AppException:
            continue
        allowed.append(assignment)
    return allowed


async def require_assignment_management(
    session: AsyncSession, actor: User, assignment: UserRoleAssignment
) -> None:
    from src.hr.models import EmploymentRecord
    from src.hr.organisations import require_organisation_permission

    department_id = (
        assignment.department_id
        if assignment.scope == RoleAssignmentScope.DEPARTMENT
        else None
    )
    if assignment.scope == RoleAssignmentScope.SELF:
        employment = await session.scalar(
            select(EmploymentRecord).where(
                EmploymentRecord.user_id == assignment.user_id,
                EmploymentRecord.organisation_id == assignment.organisation_id,
            )
        )
        department_id = employment.department_id if employment else None
    await require_organisation_permission(
        session, actor, assignment.organisation_id, "user.manage", department_id
    )
    if not actor.is_superuser:
        await delegation_authority(session, actor, assignment)


async def require_user_management(
    session: AsyncSession, actor: User, target: User
) -> None:
    from src.auth.policy import can_act_on_user

    if actor.is_superuser:
        return
    if target.is_superuser or not await can_act_on_user(
        session=session,
        current_user=actor,
        target_user_id=target.id,
        permission_key="user.manage",
    ):
        raise AppException("User is outside your active management scope", 403)


async def delegation_authority(
    session: AsyncSession,
    actor: User,
    assignment: UserRoleAssignment,
    *,
    require_active_target: bool = False,
) -> UserRoleAssignment:
    from sqlalchemy.orm import selectinload

    from src.auth.delegation import ordinary_role, permission_keys
    from src.auth.policy import _active_assignments
    from src.hr.models import EmploymentRecord, EmploymentStatus

    if actor.id == assignment.user_id:
        raise AppException("Another administrator must manage your access", 403)
    target = await session.get(User, assignment.user_id)
    if target is None or target.is_superuser:
        raise AppException("Platform accounts are superuser-managed", 403)
    role = await session.scalar(
        select(Role)
        .where(Role.id == assignment.role_id)
        .options(selectinload(Role.permissions))
    )
    if (
        role is None
        or not ordinary_role(role)
        or assignment.scope != RoleAssignmentScope.SELF
        or assignment.department_id is not None
    ):
        raise AppException(
            "Only ordinary staff self-service access may be delegated; appointments and special duties require a superuser",
            403,
        )
    employment = await session.scalar(
        select(EmploymentRecord).where(
            EmploymentRecord.user_id == assignment.user_id,
            EmploymentRecord.organisation_id == assignment.organisation_id,
        )
    )
    if employment is None:
        raise AppException("Target must belong to the same employer", 403)
    if require_active_target and employment.status != EmploymentStatus.ACTIVE:
        raise AppException("Delegation requires active recipient employment", 403)
    roles = {r.id: r for r in actor.roles}
    issuer = await session.scalar(
        select(EmploymentRecord).where(
            EmploymentRecord.user_id == actor.id,
            EmploymentRecord.status == EmploymentStatus.ACTIVE,
        )
    )
    if issuer is None:
        raise AppException("Delegation requires active employer placement", 403)
    for source in await _active_assignments(session=session, user_id=actor.id):
        source_role = roles.get(source.role_id)
        if (
            source.authority_assignment_id
            or source.organisation_id != assignment.organisation_id
            or issuer.organisation_id != source.organisation_id
            or (
                source.scope == RoleAssignmentScope.DEPARTMENT
                and issuer.department_id != source.department_id
            )
            or source_role is None
        ):
            continue
        keys = permission_keys(source_role)
        if "user.manage" not in keys or not permission_keys(role).issubset(keys):
            continue
        if source.scope == RoleAssignmentScope.ALL or (
            source.scope == RoleAssignmentScope.DEPARTMENT
            and source.department_id == employment.department_id
        ):
            return source
    raise AppException("No active authority permits this delegated grant", 403)


async def audit_assignment(
    session: AsyncSession, assignment: UserRoleAssignment, action: str
) -> None:
    from src.audit.service import record_change

    await session.flush()
    snapshot = {
        key: str(getattr(assignment, key))
        if getattr(assignment, key) is not None
        else None
        for key in (
            "role_id",
            "scope",
            "department_id",
            "effective_to",
            "authority_assignment_id",
        )
    }
    await record_change(
        session,
        entity_type="employee",
        entity_id=str(assignment.user_id),
        record_type="role_assignment",
        record_id=str(assignment.id),
        organisation_id=assignment.organisation_id,
        action=action,
        changes={
            "assignment": (
                snapshot if action == "DELETE" else None,
                None if action == "DELETE" else snapshot,
            )
        },
    )
