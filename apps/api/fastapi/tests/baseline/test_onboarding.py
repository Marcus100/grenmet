"""HR setup cannot change account security through mailbox provisioning."""

import pytest
from sqlalchemy import select

from src.auth import onboarding
from src.auth import service as auth_service
from src.auth.models import Role
from src.auth.onboarding_schemas import ActivationConfirm
from src.baseline import service
from src.baseline.models import StaffCredential
from src.baseline.schemas import StaffInput
from src.exceptions import AppException
from src.hr.models import Grade
from tests.factories import make_department, make_user


async def setup_staff(session):
    actor = await make_user(session, superuser=True)
    person = await make_user(session)
    department = await make_department(session)
    grade = Grade(
        id="onboarding_grade",
        code="STAFF",
        label="Staff",
        rank=1,
        department_id=department.id,
    )
    session.add(grade)
    await session.commit()
    return actor, person, department, grade


@pytest.mark.asyncio
@pytest.mark.parametrize("active", [True, False])
async def test_mailbox_updates_never_change_account_security(db_async, active):
    actor, person, department, grade = await setup_staff(db_async)
    person.is_active = active
    person.registration_pending = False
    person.email_verification_required = False
    person.password_setup_pending = False
    person.email_verified_at = None
    await db_async.commit()
    login, _ = await auth_service.create_session(session=db_async, user=person)
    old_password = person.hashed_password
    for mailbox in [True, False, True]:
        await service.save_staff(
            db_async,
            actor,
            person.id,
            StaffInput(
                department_id=department.id, grade_id=grade.id, mailbox_ready=mailbox
            ),
        )
        await db_async.refresh(person)
        assert person.is_active is active
        assert not person.email_verification_required
        assert not person.password_setup_pending
        assert person.email_verified_at is None
        assert person.hashed_password == old_password
        assert await db_async.get(type(login), login.id) is not None
        assert login.revoked_at is None
        state = next(
            row
            for row in await service.list_staff(db_async)
            if row.user_id == person.id
        )
        assert state.mailbox_ready is mailbox
        assert state.account_active is active
    # Ordinary personnel edits preserve recorded mailbox readiness when omitted.
    await service.save_staff(
        db_async,
        actor,
        person.id,
        StaffInput(department_id=department.id, grade_id=grade.id),
    )
    assert (await db_async.get(StaffCredential, person.id)).mailbox_ready is True


@pytest.mark.asyncio
async def test_staff_approval_after_audited_activation_without_email(db_async):
    actor, person, department, grade = await setup_staff(db_async)
    if not await db_async.scalar(select(Role.id).where(Role.name == "staff")):
        db_async.add(Role(name="staff", permissions=[]))
    person.registration_pending = True
    person.is_active = True
    person.email_verified_at = None
    person.password_setup_pending = True
    person.email_verification_required = True
    await db_async.commit()
    await service.save_staff(
        db_async,
        actor,
        person.id,
        StaffInput(department_id=department.id, grade_id=grade.id, mailbox_ready=False),
    )
    assert not await service.identity_ready_for_approval(db_async, person)
    link = await onboarding.issue_activation(db_async, actor, person.id, True)
    token = link.activation_url.split("token=", 1)[1]
    await onboarding.confirm_activation(
        db_async, ActivationConfirm(token=token, new_password="New-password-123!")
    )
    assert person.registration_pending  # Activation never approves staff access.
    assert person.email_verified_at is None
    assert await service.identity_ready_for_approval(db_async, person)
    await service.approve_registration(db_async, actor, person.id)
    assert not person.registration_pending
    assert person.email_verified_at is None
    assert (await db_async.get(StaffCredential, person.id)).mailbox_ready is False
    assert (await service.card_for(db_async, person)).status == "active"
    state = next(
        row for row in await service.list_staff(db_async) if row.user_id == person.id
    )
    assert state.staff_approval_ready and not state.mailbox_ready


@pytest.mark.asyncio
async def test_public_account_flags_are_not_activation_evidence(db_async):
    actor, person, department, grade = await setup_staff(db_async)
    person.is_active = True
    person.registration_pending = True
    person.email_verified_at = None
    person.email_verification_required = False
    person.password_setup_pending = False
    await db_async.commit()
    await service.save_staff(
        db_async,
        actor,
        person.id,
        StaffInput(department_id=department.id, grade_id=grade.id, mailbox_ready=True),
    )
    assert not await service.identity_ready_for_approval(db_async, person)
    with pytest.raises(AppException, match="administrator-approved activation"):
        await service.approve_registration(db_async, actor, person.id)
    assert person.registration_pending and person.email_verified_at is None
