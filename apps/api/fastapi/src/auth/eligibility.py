"""Who may use which app, staff access and effective permissions."""

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
    if user.is_superuser:
        return True
    from src.auth.access import effective_roles

    roles = await effective_roles(session, user)
    return any(
        permission.key == permission_key
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


def is_staff_eligible(user: User) -> bool:
    """The staff gate ``get_authenticated_user`` applies, for staff-app handoffs."""
    return (
        user.is_active
        and not user.registration_pending
        and not (user.password_setup_pending and user.email_verified_at is None)
    )


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


def require_approved_account(user: User) -> None:
    if user.registration_pending:
        raise AppException("Your registration is awaiting administrator approval", 403)
