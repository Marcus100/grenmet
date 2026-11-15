"""The first-superuser script: preview by default, one audit row, and only for an
empty system (ADR-0059 rule 1)."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from scripts import grant_superuser
from src.audit.models import AuditEntry
from src.auth.models import User
from tests.factories import make_user


@pytest.fixture
def empty_system(monkeypatch):
    """The test database is seeded with a superuser; pretend none is active."""

    async def none_active(_session: AsyncSession) -> int:
        return 0

    monkeypatch.setattr(grant_superuser, "active_superuser_count", none_active)


async def superuser_rows(db: AsyncSession, user: User) -> list[AuditEntry]:
    return list(
        (
            await db.execute(
                select(AuditEntry).where(
                    AuditEntry.record_id == str(user.id),
                    AuditEntry.action == grant_superuser.GRANT_ACTION,
                )
            )
        )
        .scalars()
        .all()
    )


async def test_refused_while_an_active_superuser_exists(
    db_async: AsyncSession,
) -> None:
    founder = await make_user(db_async, email="founder@example.org")
    plan = await grant_superuser.grant_first_superuser(
        db_async, email="founder@example.org", apply=True
    )
    assert plan.ready is False
    assert "already exists" in plan.note
    await db_async.refresh(founder)
    assert founder.is_superuser is False


@pytest.mark.usefixtures("empty_system")
async def test_preview_changes_nothing(db_async: AsyncSession) -> None:
    user = await make_user(db_async, email="first@example.org")
    plan = await grant_superuser.grant_first_superuser(
        db_async, email="first@example.org", apply=False
    )
    assert plan.ready is True
    await db_async.refresh(user)
    assert user.is_superuser is False
    assert await superuser_rows(db_async, user) == []


@pytest.mark.usefixtures("empty_system")
async def test_apply_grants_and_writes_exactly_one_audit_row(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, email="first@example.org")
    user.registration_pending = True
    db_async.add(user)
    await db_async.commit()

    plan = await grant_superuser.grant_first_superuser(
        db_async, email="FIRST@example.org", apply=True
    )
    assert plan.ready is True
    await db_async.refresh(user)
    assert user.is_superuser is True
    assert user.registration_pending is False
    assert len(await superuser_rows(db_async, user)) == 1


@pytest.mark.usefixtures("empty_system")
async def test_unverified_account_is_refused(db_async: AsyncSession) -> None:
    user = await make_user(db_async, email="new@example.org", verified=False)
    plan = await grant_superuser.grant_first_superuser(
        db_async, email="new@example.org", apply=True
    )
    assert plan.ready is False
    assert "not verified" in plan.note
    await db_async.refresh(user)
    assert user.is_superuser is False


@pytest.mark.usefixtures("empty_system")
async def test_unknown_address_is_refused(db_async: AsyncSession) -> None:
    plan = await grant_superuser.grant_first_superuser(
        db_async, email="nobody@example.org", apply=True
    )
    assert plan.ready is False
    assert plan.user_id is None


@pytest.mark.usefixtures("empty_system")
async def test_inactive_account_is_refused(db_async: AsyncSession) -> None:
    user = await make_user(db_async, email="off@example.org")
    user.is_active = False
    db_async.add(user)
    await db_async.commit()
    plan = await grant_superuser.grant_first_superuser(
        db_async, email="off@example.org", apply=True
    )
    assert plan.ready is False
    await db_async.refresh(user)
    assert user.is_superuser is False
