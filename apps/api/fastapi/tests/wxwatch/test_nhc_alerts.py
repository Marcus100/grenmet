"""Failed NHC jobs notify the configured roles once per window."""

from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.auth.models import RoleAssignmentScope
from src.notifications.models import Notification, NotificationSetting
from src.wxwatch import alerts
from tests.factories import assign_role, make_role_with_permission, make_user
from tests.wxwatch.test_migration import migrate


@pytest.fixture
async def archive_sessions(weather_engine):
    migrate(weather_engine)
    engine = create_async_engine(
        weather_engine.url.set(drivername="postgresql+asyncpg"), poolclass=NullPool
    )
    try:
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()


async def _recipient(db: AsyncSession):
    role, _ = await make_role_with_permission(db, "notifications.manage")
    user = await make_user(db)
    await assign_role(db, user=user, role=role, scope=RoleAssignmentScope.ALL)
    db.add(
        NotificationSetting(
            organisation_id="gaa",
            event_key=alerts.PULL_FAILED,
            enabled=True,
            email_enabled=False,
            recipient_roles=[role.name],
        )
    )
    await db.commit()
    return user


async def _job(archive, *, status: str, age: timedelta, kind: str = "pull") -> None:
    async with archive() as session:
        await session.execute(
            text(
                "INSERT INTO archive_nhc_jobs(id,kind,status,requested_by,payload,finished_at) "
                "VALUES (:id,:kind,:status,:who,'{}'::jsonb,now() - CAST(:age AS interval))"
            ),
            {
                "id": uuid4(),
                "kind": kind,
                "status": status,
                "who": uuid4(),
                "age": age,
            },
        )
        await session.commit()


async def _inbox_count(db: AsyncSession, user) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.recipient_user_id == user.id)
        )
        or 0
    )


async def _run(db: AsyncSession, archive) -> int:
    async with archive() as session:
        return await alerts.notify_failed_jobs(session=db, archive=session)


async def test_recent_failure_notifies_once(
    db_async: AsyncSession,
    archive_sessions,
) -> None:
    user = await _recipient(db_async)
    await _job(archive_sessions, status="failed", age=timedelta(minutes=1))

    assert await _run(db_async, archive_sessions) == 1
    assert await _run(db_async, archive_sessions) == 0
    assert await _inbox_count(db_async, user) == 1


async def test_old_and_successful_jobs_are_ignored(
    db_async: AsyncSession,
    archive_sessions,
) -> None:
    user = await _recipient(db_async)
    await _job(archive_sessions, status="failed", age=timedelta(hours=2))
    await _job(archive_sessions, status="success", age=timedelta(minutes=1))

    assert await _run(db_async, archive_sessions) == 0
    assert await _inbox_count(db_async, user) == 0


async def test_each_failed_kind_is_announced_separately(
    db_async: AsyncSession,
    archive_sessions,
) -> None:
    await _recipient(db_async)
    await _job(archive_sessions, status="failed", age=timedelta(minutes=1), kind="pull")
    await _job(
        archive_sessions, status="failed", age=timedelta(minutes=1), kind="point"
    )

    assert await _run(db_async, archive_sessions) == 2
