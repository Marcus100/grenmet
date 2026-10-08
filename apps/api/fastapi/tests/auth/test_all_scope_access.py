"""ALL authority projection keeps permission keys bound to their own live grants."""

from datetime import timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import access
from src.auth.models import RoleAssignmentScope, UserRoleAssignment, UserRoleLink
from src.auth.schemas import EffectiveAccess
from src.utils.datetime import utc_now
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)


@pytest.mark.parametrize("scope", list(RoleAssignmentScope))
async def test_all_scope_projection_does_not_borrow_another_roles_scope(
    db_async: AsyncSession, scope: RoleAssignmentScope
):
    department = await make_department(db_async, "all-projection")
    actor = await make_user(db_async)
    await make_employee(db_async, user=actor, department_id=department.id)
    roster_role, _ = await make_role_with_permission(db_async, "roster.manage")
    other_role, _ = await make_role_with_permission(db_async, "user.manage")
    await assign_role(
        db_async,
        user=actor,
        role=roster_role,
        scope=scope,
        department_id=department.id
        if scope == RoleAssignmentScope.DEPARTMENT
        else None,
    )
    await assign_role(
        db_async, user=actor, role=other_role, scope=RoleAssignmentScope.SELF
    )
    result = await access.current(db_async, actor)
    assert set(result.permission_keys) == {"roster.manage", "user.manage"}
    expected = ["roster.manage"] if scope == RoleAssignmentScope.ALL else []
    assert result.all_scope_permission_keys == expected
    assert await access.all_scope_permission_keys(db_async, actor) == expected


async def test_expired_scoped_history_does_not_revive_legacy_global_authority(db_async):
    actor = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "roster.manage")
    db_async.add(UserRoleLink(user_id=actor.id, role_id=role.id))
    await db_async.commit()
    assert await access.all_scope_permission_keys(db_async, actor) == ["roster.manage"]
    grant = UserRoleAssignment(
        organisation_id="gaa",
        user_id=actor.id,
        role_id=role.id,
        scope=RoleAssignmentScope.ALL,
        effective_to=utc_now() - timedelta(seconds=1),
    )
    db_async.add(grant)
    await db_async.commit()
    assert await access.all_scope_permission_keys(db_async, actor) == []
    assert (await access.current(db_async, actor)).permission_keys == []
    grant.effective_to = None
    await db_async.commit()
    assert await access.all_scope_permission_keys(db_async, actor) == ["roster.manage"]
    grant.scope = RoleAssignmentScope.SELF
    await db_async.commit()
    assert await access.all_scope_permission_keys(db_async, actor) == []
    assert (await access.current(db_async, actor)).permission_keys == ["roster.manage"]


def test_effective_access_additive_projection_defaults_empty():
    previous = EffectiveAccess(is_superuser=False, role_names=[], permission_keys=[])
    assert previous.all_scope_permission_keys == []
