"""Policy tests — permission checks and scope enforcement."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.policy import has_permission, require_permission
from src.exceptions import AuthorizationError
from tests.factories import (
    assign_role,
    make_role_with_permission,
    make_user,
)


async def test_superuser_always_has_permission(db_async: AsyncSession) -> None:
    """Superusers bypass all permission checks."""
    user = await make_user(db_async, superuser=True)
    assert has_permission(current_user=user, permission_key="any.obscure.key") is True


async def test_user_without_role_denied(db_async: AsyncSession) -> None:
    """A user with no roles is denied all permissions."""
    user = await make_user(db_async)
    assert (
        has_permission(current_user=user, permission_key="leave.request.create.self")
        is False
    )


async def test_user_with_matching_permission_allowed(db_async: AsyncSession) -> None:
    """A user whose role carries the permission is allowed."""
    user = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "leave.request.create.self")
    await assign_role(db_async, user=user, role=role)

    assert (
        has_permission(current_user=user, permission_key="leave.request.create.self")
        is True
    )


async def test_require_permission_raises_for_missing_key(
    db_async: AsyncSession,
) -> None:
    """require_permission raises AuthorizationError when permission is absent."""
    user = await make_user(db_async)

    with pytest.raises(AuthorizationError):
        require_permission(current_user=user, permission_key="cap.alert.publish")


async def test_require_permission_does_not_raise_for_superuser(
    db_async: AsyncSession,
) -> None:
    """require_permission is silent for superusers."""
    user = await make_user(db_async, superuser=True)
    require_permission(current_user=user, permission_key="cap.alert.publish")


async def test_permission_key_case_insensitive(db_async: AsyncSession) -> None:
    """Permission lookup is case-insensitive."""
    user = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "timesheet.approve")
    await assign_role(db_async, user=user, role=role)

    assert has_permission(current_user=user, permission_key="TIMESHEET.APPROVE") is True
    assert has_permission(current_user=user, permission_key="Timesheet.Approve") is True
