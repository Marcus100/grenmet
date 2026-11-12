"""A weather image collector that stops finishing runs notifies the configured roles."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.auth.models import RoleAssignmentScope
from src.notifications.models import Notification, NotificationSetting
from src.wxwatch import alerts
from src.wxwatch.config import wxwatch_settings
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


@pytest.fixture(autouse=True)
def _fresh_log_throttle():
    alerts._feed_logged.clear()
    yield
    alerts._feed_logged.clear()


async def _recipient(db: AsyncSession):
    role, _ = await make_role_with_permission(db, "notifications.manage")
    user = await make_user(db)
    await assign_role(db, user=user, role=role, scope=RoleAssignmentScope.ALL)
    db.add(
        NotificationSetting(
            organisation_id="gaa",
            event_key=alerts.FEED_STALE,
            enabled=True,
            email_enabled=False,
            recipient_roles=[role.name],
        )
    )
    await db.commit()
    return user


async def _collector_run(
    archive, source: str, *, status: str, started: timedelta
) -> None:
    """One collector run that started ``started`` ago and ended a minute later."""
    running = status == "running"
    async with archive() as session:
        await session.execute(
            text(
                "INSERT INTO collection_runs(id,source,started_at,expires_at,finished_at,status) "
                "VALUES (:id,:source,now() - CAST(:started AS interval),"
                "now() - CAST(:started AS interval) + interval '45 minutes',"
                "CASE WHEN CAST(:running AS boolean) THEN NULL ELSE now() - CAST(:started AS interval) + interval '1 minute' END,"
                ":status)"
            ),
            {
                "id": uuid4(),
                "source": source,
                "started": started,
                "running": running,
                "status": status,
            },
        )
        await session.commit()


async def _inbox(db: AsyncSession, user) -> list[Notification]:
    rows = await db.scalars(
        select(Notification).where(Notification.recipient_user_id == user.id)
    )
    return list(rows)


async def _inbox_count(db: AsyncSession, user) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.recipient_user_id == user.id)
        )
        or 0
    )


async def _run(db: AsyncSession, archive, now: datetime | None = None) -> int:
    async with archive() as session:
        return await alerts.notify_stale_feeds(session=db, archive=session, now=now)


async def test_a_source_that_finished_recently_is_not_reported(
    db_async: AsyncSession, archive_sessions
) -> None:
    user = await _recipient(db_async)
    await _collector_run(
        archive_sessions, "goes19", status="finished", started=timedelta(minutes=20)
    )

    assert await _run(db_async, archive_sessions) == 0
    assert await _inbox_count(db_async, user) == 0


async def test_a_quiet_source_notifies_once_a_day(
    db_async: AsyncSession, archive_sessions
) -> None:
    user = await _recipient(db_async)
    await _collector_run(
        archive_sessions, "goes19", status="finished", started=timedelta(hours=5)
    )

    assert await _run(db_async, archive_sessions) == 1
    assert await _run(db_async, archive_sessions) == 0
    (notification,) = await _inbox(db_async, user)
    assert "goes19" in notification.title
    assert "last finished a run 4 hours ago" in notification.body


async def test_failed_and_expired_runs_do_not_count_as_good(
    db_async: AsyncSession, archive_sessions
) -> None:
    user = await _recipient(db_async)
    await _collector_run(
        archive_sessions, "cimss", status="finished", started=timedelta(days=2)
    )
    await _collector_run(
        archive_sessions, "cimss", status="failed", started=timedelta(minutes=30)
    )
    await _collector_run(
        archive_sessions, "cimss", status="expired", started=timedelta(minutes=10)
    )

    assert await _run(db_async, archive_sessions) == 1
    (notification,) = await _inbox(db_async, user)
    assert "cimss" in notification.title


async def test_a_run_in_progress_does_not_hide_a_stale_source(
    db_async: AsyncSession, archive_sessions
) -> None:
    await _recipient(db_async)
    await _collector_run(
        archive_sessions, "sfcana", status="finished", started=timedelta(hours=6)
    )
    await _collector_run(
        archive_sessions, "sfcana", status="running", started=timedelta(minutes=2)
    )

    assert await _run(db_async, archive_sessions) == 1


async def test_a_source_with_no_finished_run_says_so(
    db_async: AsyncSession, archive_sessions
) -> None:
    user = await _recipient(db_async)
    await _collector_run(
        archive_sessions, "uwyo", status="failed", started=timedelta(hours=1)
    )

    assert await _run(db_async, archive_sessions) == 1
    (notification,) = await _inbox(db_async, user)
    assert "uwyo" in notification.title
    assert "has not finished a run in the last 14 days" in notification.body


async def test_a_source_silent_past_the_give_up_window_is_retired(
    db_async: AsyncSession, archive_sessions
) -> None:
    user = await _recipient(db_async)
    await _collector_run(
        archive_sessions, "retired", status="finished", started=timedelta(days=20)
    )

    assert await _run(db_async, archive_sessions) == 0
    assert await _inbox_count(db_async, user) == 0


async def test_an_ignored_source_is_not_reported(
    db_async: AsyncSession, archive_sessions, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = await _recipient(db_async)
    monkeypatch.setattr(wxwatch_settings, "FEED_IGNORED_SOURCES", "uwyo, paused")
    for source in ("uwyo", "paused", "goes19"):
        await _collector_run(
            archive_sessions, source, status="finished", started=timedelta(hours=8)
        )

    assert await _run(db_async, archive_sessions) == 1
    (notification,) = await _inbox(db_async, user)
    assert "goes19" in notification.title


async def test_the_limit_is_configurable(
    db_async: AsyncSession, archive_sessions, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _recipient(db_async)
    await _collector_run(
        archive_sessions, "goes19", status="finished", started=timedelta(hours=2)
    )

    assert await _run(db_async, archive_sessions) == 0
    monkeypatch.setattr(wxwatch_settings, "FEED_STALE_MINUTES", 60)
    assert await _run(db_async, archive_sessions) == 1


async def test_a_limit_under_thirty_minutes_is_treated_as_thirty(
    db_async: AsyncSession, archive_sessions, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _recipient(db_async)
    monkeypatch.setattr(wxwatch_settings, "FEED_STALE_MINUTES", 5)
    await _collector_run(
        archive_sessions, "goes19", status="finished", started=timedelta(minutes=21)
    )

    assert await _run(db_async, archive_sessions) == 0


async def test_each_stale_source_is_reported_separately(
    db_async: AsyncSession, archive_sessions
) -> None:
    user = await _recipient(db_async)
    for source in ("goes19", "cimss"):
        await _collector_run(
            archive_sessions, source, status="finished", started=timedelta(hours=9)
        )

    assert await _run(db_async, archive_sessions) == 2
    titles = sorted(n.title for n in await _inbox(db_async, user))
    assert "cimss" in titles[0]
    assert "goes19" in titles[1]


async def test_default_roles_are_told_when_no_setting_exists(
    db_async: AsyncSession, archive_sessions
) -> None:
    recipients = []
    for role_name in alerts.events.get(alerts.FEED_STALE).default_roles:
        role, _ = await make_role_with_permission(
            db_async, "notifications.manage", role_name=f"{role_name}"
        )
        user = await make_user(db_async)
        await assign_role(db_async, user=user, role=role, scope=RoleAssignmentScope.ALL)
        recipients.append(user)
    outsider = await make_user(db_async)
    await db_async.commit()
    await _collector_run(
        archive_sessions, "goes19", status="finished", started=timedelta(hours=5)
    )

    assert await _run(db_async, archive_sessions) == 2
    assert [await _inbox_count(db_async, user) for user in recipients] == [1, 1]
    assert await _inbox_count(db_async, outsider) == 0


async def test_sentry_gets_one_error_per_source_per_window(
    db_async: AsyncSession, archive_sessions, caplog: pytest.LogCaptureFixture
) -> None:
    await _recipient(db_async)
    await _collector_run(
        archive_sessions, "goes19", status="finished", started=timedelta(hours=5)
    )

    with caplog.at_level("ERROR", logger="src.wxwatch.alerts"):
        await _run(db_async, archive_sessions)
        await _run(db_async, archive_sessions)
        later = datetime.now(UTC) + timedelta(hours=7)
        await _run(db_async, archive_sessions, now=later)

    stale = [
        r
        for r in caplog.records
        if r.getMessage().startswith("Weather image feed is stale")
    ]
    assert len(stale) == 2
    assert stale[0].area == "wxwatch.feed.goes19"
    assert "299 minutes ago" in stale[0].getMessage()


@pytest.mark.parametrize(
    ("age", "expected"),
    [
        (timedelta(minutes=95), "95 minutes"),
        (timedelta(hours=5, minutes=40), "5 hours"),
        (timedelta(days=3, hours=2), "3 days"),
    ],
)
def test_age_is_written_in_whole_units(age: timedelta, expected: str) -> None:
    assert alerts._age_text(age) == expected
