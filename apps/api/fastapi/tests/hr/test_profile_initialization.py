"""Profile reads must survive concurrent creation of their optional records."""

from uuid import uuid4

import pytest
from sqlalchemy import event, insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, UOWTransaction

from src.audit.models import AuditEntry
from src.database import engine
from src.hr import service
from src.hr.models import (
    ApprovalAuthority,
    RosterPreference,
    UserAddress,
    UserProfile,
)
from tests.factories import make_user


@pytest.mark.parametrize(
    "record_type", [UserProfile, UserAddress, RosterPreference, ApprovalAuthority]
)
async def test_profile_read_survives_concurrent_record_creation(
    db_async: AsyncSession,
    record_type: type[UserProfile | UserAddress | RosterPreference | ApprovalAuthority],
) -> None:
    user = await make_user(db_async)
    user_id = user.id
    raced = False

    def create_competing_record(
        session: Session, _context: UOWTransaction, _instances: object
    ) -> None:
        nonlocal raced
        if raced or not any(isinstance(row, record_type) for row in session.new):
            return
        # Another request wins after this request's SELECT but before its INSERT.
        with engine.begin() as connection:
            connection.execute(insert(record_type).values(user_id=user_id))
        raced = True

    event.listen(db_async.sync_session, "before_flush", create_competing_record)
    try:
        profile = await service.read_profile_for_user(
            session=db_async, current_user=user
        )
    finally:
        event.remove(db_async.sync_session, "before_flush", create_competing_record)

    assert raced
    assert profile.id == user_id
    assert profile.identity.email == user.email
    for model in (UserProfile, UserAddress, RosterPreference, ApprovalAuthority):
        rows = await db_async.scalars(select(model).where(model.user_id == user_id))
        assert len(rows.all()) == 1


async def test_profile_initialization_preserves_create_history(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    await service.read_profile_for_user(session=db_async, current_user=user)
    await service.read_profile_for_user(session=db_async, current_user=user)
    entries = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.entity_type == "employee",
                AuditEntry.entity_id == str(user.id),
            )
        )
    ).all()
    assert sorted((row.record_type, row.action) for row in entries) == [
        ("approval_authority", "create"),
        ("user_address", "create"),
        ("user_profile", "create"),
    ]


async def test_profile_creation_does_not_hide_other_integrity_errors(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    user_id = user.id

    def invalidate_creator(
        session: Session, _context: UOWTransaction, _instances: object
    ) -> None:
        for row in session.new:
            if isinstance(row, UserProfile):
                row.created_by = uuid4()

    event.listen(db_async.sync_session, "before_flush", invalidate_creator)
    try:
        with pytest.raises(IntegrityError):
            await service._get_or_create_profile(session=db_async, user=user)
    finally:
        event.remove(db_async.sync_session, "before_flush", invalidate_creator)

    assert user.id == user_id
    assert (
        await db_async.scalar(
            select(UserProfile.id).where(UserProfile.user_id == user_id)
        )
        is None
    )
    profile = await service.read_profile_for_user(session=db_async, current_user=user)
    assert profile.id == user_id
