"""Who may use which app, staff access and effective permissions."""

import uuid

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import (
    User,
)
from src.exceptions import AppException
from src.utils.datetime import utc_now


async def has_effective_permission(
    *, session: AsyncSession, user: User, permission_key: str
) -> bool:
    """Permission check for app-scoped users, whose roles aren't preloaded."""
    from src.auth.policy import is_organisation_bound

    if is_organisation_bound(user=user, permission_key=permission_key):
        return False
    if user.is_superuser:
        return True
    from src.auth.access import effective_roles

    roles = await effective_roles(session, user)
    wanted = permission_key.strip().lower()
    return any(
        permission.key.lower() == wanted
        for role in roles
        for permission in role.permissions
    )


async def request_staff_access(*, session: AsyncSession, user: User) -> User:
    """Put an account in the staff approval queue (idempotent)."""
    if user.registration_pending and user.staff_access_requested_at is None:
        user.staff_access_requested_at = utc_now()
        session.add(user)
        await session.commit()
        await session.refresh(user)
    return user


def is_staff_eligible(user: User, *, superuser_only: bool = False) -> bool:
    """The staff gate ``get_authenticated_user`` applies, for staff-app handoffs.

    ``registration_pending`` (staff approval) does not block a superuser on a
    superuser-only app such as barrels-admin (ADR-0059 rule 5). GAA and GMS staff
    apps are unchanged."""
    if not user.is_active or (
        user.password_setup_pending and user.email_verified_at is None
    ):
        return False
    if superuser_only and user.is_superuser:
        return True
    return not user.registration_pending


async def is_eligible_for_app(
    *, session: AsyncSession, user: User, app_key: str
) -> bool:
    """Active, with explicit CMS access or ``app.<key>.access``.

    Email verification never gates access (owner decision, 16 October 2026).
    ``registration_pending`` means "staff approval pending" and does not
    affect app-scoped access.
    """
    if not user.is_active or (
        user.password_setup_pending and user.email_verified_at is None
    ):
        return False
    if user.is_superuser:
        return True
    if app_key == "cms":
        return user.cms_access in {"writer", "publisher"}
    from src.auth.access import effective_roles

    roles = await effective_roles(session, user)
    key = f"app.{app_key}.access"
    return any(
        permission.key == key for role in roles for permission in role.permissions
    )


async def eligible_user_ids_for_app(
    *, session: AsyncSession, users: list[User], app_key: str
) -> set[uuid.UUID]:
    """``is_eligible_for_app`` for many accounts with a fixed number of queries.

    Same rules as the one-account form: the account gate, superusers, CMS access, then
    ``app.<key>.access`` through live assignments plus plain role links (skipped once
    the person has employment records and none is live)."""
    from src.auth.delegation import DEPARTMENT_AUTHORITY_ROLES
    from src.auth.models import (
        Permission,
        Role,
        RolePermissionLink,
        UserRoleAssignment,
        UserRoleLink,
    )
    from src.auth.policy import active_assignments_of
    from src.hr.models import EmploymentRecord, live_employment_clause
    from src.utils.timezones import local_today

    open_users = [
        u
        for u in users
        if u.is_active
        and not (u.password_setup_pending and u.email_verified_at is None)
    ]
    eligible = {u.id for u in open_users if u.is_superuser}
    rest = [u for u in open_users if not u.is_superuser]
    if app_key == "cms":
        return eligible | {
            u.id for u in rest if u.cms_access in {"writer", "publisher"}
        }
    if not rest:
        return eligible
    rest_ids = [u.id for u in rest]
    key = f"app.{app_key}.access"
    carrying = set(
        (
            await session.scalars(
                select(RolePermissionLink.role_id)
                .join(Permission, Permission.id == RolePermissionLink.permission_id)
                .where(Permission.key == key)
            )
        ).all()
    )
    if not carrying:
        return eligible
    for assignment in await active_assignments_of(session=session, user_ids=rest_ids):
        if assignment.role_id in carrying:
            eligible.add(assignment.user_id)
    pending = [uid for uid in rest_ids if uid not in eligible]
    if not pending:
        return eligible
    linked = set(
        (
            await session.scalars(
                select(UserRoleLink.user_id)
                .join(Role, Role.id == UserRoleLink.role_id)
                .where(
                    UserRoleLink.user_id.in_(pending),
                    UserRoleLink.role_id.in_(carrying),
                    Role.name.not_in(DEPARTMENT_AUTHORITY_ROLES),
                    ~exists(
                        select(UserRoleAssignment.id).where(
                            UserRoleAssignment.user_id == UserRoleLink.user_id,
                            UserRoleAssignment.role_id == UserRoleLink.role_id,
                        )
                    ),
                )
            )
        ).all()
    )
    if not linked:
        return eligible
    has_record = set(
        (
            await session.scalars(
                select(EmploymentRecord.user_id).where(
                    EmploymentRecord.user_id.in_(linked)
                )
            )
        ).all()
    )
    has_live = set(
        (
            await session.scalars(
                select(EmploymentRecord.user_id).where(
                    EmploymentRecord.user_id.in_(linked),
                    live_employment_clause(local_today()),
                )
            )
        ).all()
    )
    return eligible | {
        uid for uid in linked if not (uid in has_record and uid not in has_live)
    }


def require_approved_account(user: User) -> None:
    if user.registration_pending:
        raise AppException("Your registration is awaiting administrator approval", 403)
