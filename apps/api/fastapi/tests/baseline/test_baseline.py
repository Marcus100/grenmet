import json
from pathlib import Path

import pytest
from fastapi.concurrency import run_in_threadpool
from sqlmodel import Session, select

from src.auth.models import Role, User, UserRoleAssignment
from src.auth.permissions import seed_permissions_and_roles_async
from src.baseline.models import StaffCredential
from src.baseline.seed import seed_baseline
from src.database import engine

PROFILE = Path(__file__).resolve().parents[5] / "scripts/gms-roster/profiles/gms.json"


def seed(apply):
    with Session(engine) as session:
        result = seed_baseline(session, json.loads(PROFILE.read_text()), apply=apply)
        session.commit() if apply else session.rollback()
        return result


@pytest.mark.asyncio
async def test_preview_creates_nothing_and_repeat_preserves_online_edits(db_async):
    await seed_permissions_and_roles_async(db_async)
    assert (await run_in_threadpool(seed, False))["status"] == "preview"
    assert not (await db_async.execute(select(StaffCredential))).scalars().all()
    assert (await run_in_threadpool(seed, True))["status"] == "initialised"
    credentials = (await db_async.execute(select(StaffCredential))).scalars().all()
    assert len(credentials) == 21
    user = (
        (await db_async.execute(select(User).where(User.username == "ewhint")))
        .scalars()
        .one()
    )
    assert user.is_superuser and not user.is_active and user.password_setup_pending
    number = (await db_async.get(StaffCredential, user.id)).number
    user.first_name = "Online edit"
    db_async.add(user)
    assignment = (
        (
            await db_async.execute(
                select(UserRoleAssignment).where(UserRoleAssignment.user_id == user.id)
            )
        )
        .scalars()
        .first()
    )
    await db_async.delete(assignment)
    await db_async.commit()
    assert (await run_in_threadpool(seed, True))["status"] == "already_initialised"
    await db_async.refresh(user)
    assert user.first_name == "Online edit"
    assert (await db_async.get(StaffCredential, user.id)).number == number
    assert await db_async.get(UserRoleAssignment, assignment.id) is None


@pytest.mark.asyncio
async def test_permission_seed_preserves_removed_permissions_and_deleted_role(db_async):
    await seed_permissions_and_roles_async(db_async)
    from sqlalchemy.orm import selectinload

    role = (
        (
            await db_async.execute(
                select(Role)
                .where(Role.name == "cap-publisher")
                .options(selectinload(Role.permissions))
            )
        )
        .scalars()
        .one()
    )
    role.permissions.clear()
    await db_async.commit()
    await seed_permissions_and_roles_async(db_async)
    await db_async.refresh(role, ["permissions"])
    assert role.permissions == []
    await db_async.delete(role)
    await db_async.commit()
    await seed_permissions_and_roles_async(db_async)
    assert (
        await db_async.execute(select(Role).where(Role.name == "cap-publisher"))
    ).scalars().first() is None


@pytest.mark.asyncio
async def test_pending_staff_grade_edit_updates_profile_source_and_preserves_login(
    db_async,
):
    from src.baseline import service
    from src.baseline.schemas import StaffInput
    from src.hr.models import Grade

    await seed_permissions_and_roles_async(db_async)
    await run_in_threadpool(seed, True)
    user = (
        (await db_async.execute(select(User).where(User.username == "ewhint")))
        .scalars()
        .one()
    )
    user.is_active = True
    user.email_verification_required = False
    db_async.add(user)
    await db_async.commit()
    employment = await service.employment_for(db_async, user.id)
    original_grade = employment.grade_id
    grade = (
        (await db_async.execute(select(Grade).where(Grade.id != original_grade)))
        .scalars()
        .first()
    )
    await service.save_staff(
        db_async,
        user,
        user.id,
        StaffInput(
            department_id=grade.department_id, grade_id=grade.id, mailbox_ready=True
        ),
    )
    await db_async.refresh(employment)
    assert employment.grade_id == grade.id and employment.employee_number is None
    assert user.is_active and not user.email_verification_required
    staff = next(
        row for row in await service.list_staff(db_async) if row.user_id == user.id
    )
    assert (
        staff.grade_id == grade.id
        and not staff.employment_ready
        and staff.status == "draft"
    )
    assert (await service.card_for(db_async, user)).grade == grade.label
