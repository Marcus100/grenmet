import logging
import uuid

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import (
    Role,
    RoleAssignmentScope,
    User,
    UserRoleAssignment,
)
from src.auth.permissions import ORGANISATION_BOUND_KEYS
from src.exceptions import AuthorizationError
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

ERROR_PERMISSION_DENIED = "Insufficient permission for this operation"


async def _active_assignments(
    *, session: AsyncSession, user_id: uuid.UUID
) -> list[UserRoleAssignment]:
    now = utc_now()
    from src.auth.delegation import DEPARTMENT_AUTHORITY_ROLES
    from src.hr.models import EmploymentRecord, EmploymentStatus

    live_appointment = exists(
        select(EmploymentRecord.id).where(
            EmploymentRecord.user_id == UserRoleAssignment.user_id,
            EmploymentRecord.organisation_id == UserRoleAssignment.organisation_id,
            EmploymentRecord.department_id == UserRoleAssignment.department_id,
            EmploymentRecord.status == EmploymentStatus.ACTIVE,
            UserRoleAssignment.scope == RoleAssignmentScope.DEPARTMENT,
            UserRoleAssignment.user_id.in_(
                select(User.id).where(User.is_active.is_(True))
            ),
        )
    )
    # Ending employment ends every role scoped to that organisation (owner
    # decision 2026-10-28, #789). No employment record at all (organisation
    # administrators, platform staff) keeps the assignment; an ended record, or a
    # deactivated account, drops it. SELF-scope assignments are not gated.
    live_holder = (
        ~exists(
            select(EmploymentRecord.id).where(
                EmploymentRecord.user_id == UserRoleAssignment.user_id,
                EmploymentRecord.organisation_id == UserRoleAssignment.organisation_id,
            )
        )
        | exists(
            select(EmploymentRecord.id).where(
                EmploymentRecord.user_id == UserRoleAssignment.user_id,
                EmploymentRecord.organisation_id == UserRoleAssignment.organisation_id,
                EmploymentRecord.status == EmploymentStatus.ACTIVE,
            )
        )
    ) & UserRoleAssignment.user_id.in_(select(User.id).where(User.is_active.is_(True)))
    result = await session.execute(
        select(UserRoleAssignment).where(
            UserRoleAssignment.user_id == user_id,
            (UserRoleAssignment.scope == RoleAssignmentScope.SELF) | live_holder,
            UserRoleAssignment.effective_from <= now,
            UserRoleAssignment.effective_to.is_(None)
            | (UserRoleAssignment.effective_to > now),
            ~UserRoleAssignment.role_id.in_(
                select(Role.id).where(Role.name.in_(DEPARTMENT_AUTHORITY_ROLES))
            )
            | live_appointment,
        )
    )
    from src.auth.delegation import valid_delegated_assignments

    return await valid_delegated_assignments(session, list(result.scalars().all()))


async def has_role_permission(
    *, session: AsyncSession, user: User, permission_key: str
) -> bool:
    """True when a role the user holds right now carries ``permission_key`` (ADR-0050).

    Resolved through ``access.all_scope_permission_keys``, never through
    ``user.roles`` or ``has_permission``: only live ALL-scope assignments count
    (``effective_from`` <= now < ``effective_to``, open-ended when null; an expired
    or not-yet-started one gives nothing), plus plain role links for roles the user
    never had an assignment for (a plain link cannot expire). SELF- and
    DEPARTMENT-scoped assignments give no staff key. A superuser has no implicit
    key: staff keys must be granted through a role. Organisation-bound keys are
    always False.
    """
    wanted = permission_key.strip().lower()
    if not user.is_active or wanted in ORGANISATION_BOUND_KEYS:
        return False
    from src.auth.access import all_scope_permission_keys

    return wanted in {
        key.lower() for key in await all_scope_permission_keys(session, user)
    }


def is_organisation_bound(*, user: User, permission_key: str) -> bool:
    """True (and logged) when the key is organisation-bound (ADR-0044).

    Organisation keys are resolved only through OrgContext and the organisation
    resolver, never by the global checks: those give superusers every key and
    let a staff role pass outside any organisation. The one place for the rule.
    """
    if permission_key.strip().lower() not in ORGANISATION_BOUND_KEYS:
        return False
    logger.warning(
        "Organisation-bound permission asked of a global check",
        extra={"user_id": str(user.id), "permission_key": permission_key},
    )
    return True


def has_permission(*, current_user: User, permission_key: str) -> bool:
    if is_organisation_bound(user=current_user, permission_key=permission_key):
        return False
    if current_user.is_superuser:
        return True
    normalized_permission_key = permission_key.strip().lower()
    for role in current_user.roles:
        for permission in role.permissions:
            if permission.key.lower() == normalized_permission_key:
                return True
    return False


def require_permission(*, current_user: User, permission_key: str) -> None:
    if not has_permission(current_user=current_user, permission_key=permission_key):
        logger.warning(
            "Permission denied",
            extra={"user_id": str(current_user.id), "permission_key": permission_key},
        )
        raise AuthorizationError(ERROR_PERMISSION_DENIED)


async def can_act_on_user(
    *,
    session: AsyncSession,
    current_user: User,
    target_user_id: uuid.UUID,
    permission_key: str,
    allow_self: bool = False,
) -> bool:
    if is_organisation_bound(user=current_user, permission_key=permission_key):
        return False
    if current_user.is_superuser:
        return True

    if not has_permission(current_user=current_user, permission_key=permission_key):
        return False

    if allow_self and current_user.id == target_user_id:
        return True

    role_ids_with_permission = {
        role.id
        for role in current_user.roles
        if any(
            permission.key.lower() == permission_key.lower()
            for permission in role.permissions
        )
    }
    if not role_ids_with_permission:
        return False

    assignments = [
        assignment
        for assignment in await _active_assignments(
            session=session, user_id=current_user.id
        )
        if assignment.role_id in role_ids_with_permission
    ]
    return await _assignment_allows_target(
        session=session,
        assignments=assignments,
        current_user_id=current_user.id,
        target_user_id=target_user_id,
    )


async def approval_role_ids(
    session: AsyncSession, role_ids: set[uuid.UUID]
) -> set[uuid.UUID]:
    """Expand only the two equal departmental authority templates."""
    from src.auth.delegation import DEPARTMENT_AUTHORITY_ROLES

    result = await session.execute(
        select(Role.id).where(Role.name.in_(DEPARTMENT_AUTHORITY_ROLES))
    )
    equivalent_ids = set(result.scalars().all())
    if role_ids & equivalent_ids:
        return role_ids | equivalent_ids
    return role_ids


async def can_act_on_user_for_role(
    *,
    session: AsyncSession,
    current_user: User,
    target_user_id: uuid.UUID,
    required_role_id: uuid.UUID,
    allow_self: bool = False,
) -> bool:
    if current_user.is_superuser:
        return True
    if allow_self and current_user.id == target_user_id:
        return True
    required_role_ids = await approval_role_ids(session, {required_role_id})
    assignments = [
        assignment
        for assignment in await _active_assignments(
            session=session, user_id=current_user.id
        )
        if assignment.role_id in required_role_ids
    ]
    return await _assignment_allows_target(
        session=session,
        assignments=assignments,
        current_user_id=current_user.id,
        target_user_id=target_user_id,
    )


async def _assignment_allows_target(
    *,
    session: AsyncSession,
    assignments: list[UserRoleAssignment],
    current_user_id: uuid.UUID,
    target_user_id: uuid.UUID,
) -> bool:
    if not assignments:
        return False

    # Local import to avoid hard coupling auth package import graph.
    from src.hr.models import EmploymentRecord

    target_result = await session.execute(
        select(EmploymentRecord).where(EmploymentRecord.user_id == target_user_id)
    )
    target_employment = target_result.scalars().first()
    if target_employment is None:
        return False
    for assignment in assignments:
        if assignment.organisation_id != target_employment.organisation_id:
            continue
        if assignment.scope == RoleAssignmentScope.ALL:
            return True
        if (
            assignment.scope == RoleAssignmentScope.SELF
            and current_user_id == target_user_id
        ):
            return True
        if (
            assignment.scope == RoleAssignmentScope.DEPARTMENT
            and assignment.department_id == target_employment.department_id
        ):
            return True
    return False
