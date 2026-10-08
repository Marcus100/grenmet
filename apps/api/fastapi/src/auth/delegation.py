"""Bounded ordinary HR delegation; explicit appointments never derive from titles."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth.models import Role, RoleAssignmentScope, User, UserRoleAssignment
from src.utils.datetime import utc_now

DELEGATABLE_ROLES = frozenset({"staff"})
DEPARTMENT_AUTHORITY_ROLES = frozenset(
    {"department-manager", "department-assistant-manager"}
)


def permission_keys(role: Role) -> set[str]:
    return {p.key.lower() for p in role.permissions}


def ordinary_role(role: Role) -> bool:
    from src.auth.permissions import DEFAULT_ROLES

    return role.name in DELEGATABLE_ROLES and permission_keys(role).issubset(
        DEFAULT_ROLES[role.name][1]
    )


async def valid_delegated_assignments(
    session: AsyncSession, assignments: list[UserRoleAssignment]
) -> list[UserRoleAssignment]:
    """Sources must be direct grants: no chains, cycles, or legacy authority."""
    source_ids = {
        a.authority_assignment_id for a in assignments if a.authority_assignment_id
    }
    if not source_ids:
        return assignments
    from src.hr.models import EmploymentRecord, EmploymentStatus

    now = utc_now()
    sources = list(
        (
            await session.scalars(
                select(UserRoleAssignment)
                .join(User, User.id == UserRoleAssignment.user_id)
                .where(
                    UserRoleAssignment.id.in_(source_ids),
                    UserRoleAssignment.authority_assignment_id.is_(None),
                    UserRoleAssignment.effective_from <= now,
                    UserRoleAssignment.effective_to.is_(None)
                    | (UserRoleAssignment.effective_to > now),
                    User.is_active.is_(True),
                )
            )
        ).all()
    )
    by_id = {a.id: a for a in sources}
    roles = {
        r.id: r
        for r in (
            await session.scalars(
                select(Role)
                .where(Role.id.in_({a.role_id for a in [*assignments, *sources]}))
                .options(selectinload(Role.permissions))
            )
        ).all()
    }
    employment = {
        e.user_id: e
        for e in (
            await session.scalars(
                select(EmploymentRecord).where(
                    EmploymentRecord.user_id.in_(
                        {a.user_id for a in [*assignments, *sources]}
                    )
                )
            )
        ).all()
    }
    valid = []
    for grant in assignments:
        if grant.authority_assignment_id is None:
            valid.append(grant)
            continue
        source = by_id.get(grant.authority_assignment_id)
        role = roles.get(grant.role_id)
        source_role = roles.get(source.role_id) if source else None
        target = employment.get(grant.user_id)
        issuer = employment.get(source.user_id) if source else None
        if not source or not role or not source_role or not target or not issuer:
            continue
        if (
            issuer.status != EmploymentStatus.ACTIVE
            or target.status != EmploymentStatus.ACTIVE
            or issuer.organisation_id != source.organisation_id
        ):
            continue
        if (
            source.scope == RoleAssignmentScope.DEPARTMENT
            and source.department_id != issuer.department_id
        ):
            continue
        if (
            source_role.name in DEPARTMENT_AUTHORITY_ROLES
            and source.scope != RoleAssignmentScope.DEPARTMENT
        ):
            continue
        if not ordinary_role(role) or grant.scope != RoleAssignmentScope.SELF:
            continue
        if (
            source.user_id == grant.user_id
            or source.organisation_id != grant.organisation_id
            or target.organisation_id != grant.organisation_id
        ):
            continue
        keys = permission_keys(source_role)
        if "user.manage" not in keys or not permission_keys(role).issubset(keys):
            continue
        if source.scope == RoleAssignmentScope.ALL or (
            source.scope == RoleAssignmentScope.DEPARTMENT
            and source.department_id == target.department_id
        ):
            valid.append(grant)
    return valid
