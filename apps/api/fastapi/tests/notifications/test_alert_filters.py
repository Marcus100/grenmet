"""Window dedupe and snooze on notify()."""

from datetime import timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.config import settings
from src.notifications import service as notification_service
from src.notifications.models import (
    DeliveryStatus,
    Notification,
    NotificationDelivery,
    NotificationSnooze,
)
from src.utils.datetime import utc_now
from tests.factories import make_user

EVENT = "roster.published"
CONTEXT = {"department": "Met", "period": "October"}


async def _notify(
    db: AsyncSession,
    user: User,
    *,
    entity_id: str | None = "a",
    suppress_within: timedelta | None = timedelta(hours=1),
) -> int:
    sent = await notification_service.notify(
        db,
        event_key=EVENT,
        organisation_id="gaa",
        recipients=(user.id,),
        context=CONTEXT,
        entity_type="test" if entity_id else None,
        entity_id=entity_id,
        suppress_within=suppress_within,
    )
    await db.commit()
    return sent


async def _count(db: AsyncSession, user: User) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.recipient_user_id == user.id)
        )
        or 0
    )


async def test_repeat_inside_window_is_suppressed(db_async: AsyncSession) -> None:
    user = await make_user(db_async)

    assert await _notify(db_async, user) == 1
    assert await _notify(db_async, user) == 0

    assert await _count(db_async, user) == 1


async def test_repeat_after_window_is_sent(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    assert await _notify(db_async, user) == 1
    old = await db_async.scalar(
        select(Notification).where(Notification.recipient_user_id == user.id)
    )
    assert old is not None
    old.created_at = utc_now() - timedelta(hours=2)
    await db_async.commit()

    assert await _notify(db_async, user) == 1


async def test_different_entity_is_not_suppressed(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    assert await _notify(db_async, user, entity_id="a") == 1

    assert await _notify(db_async, user, entity_id="b") == 1


async def test_no_window_keeps_old_behaviour(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    assert await _notify(db_async, user, suppress_within=None) == 1

    assert await _notify(db_async, user, suppress_within=None) == 1


async def _snooze(
    db: AsyncSession,
    *,
    until_delta: timedelta,
    entity_id: str | None = None,
    organisation_id: str | None = "gaa",
) -> None:
    db.add(
        NotificationSnooze(
            organisation_id=organisation_id,
            event_key=EVENT,
            entity_type="test" if entity_id else None,
            entity_id=entity_id,
            until=utc_now() + until_delta,
            reason="planned work",
        )
    )
    await db.commit()


async def test_active_snooze_silences_event(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    await _snooze(db_async, until_delta=timedelta(hours=1))

    assert await _notify(db_async, user, suppress_within=None) == 0
    assert await _count(db_async, user) == 0


async def test_expired_snooze_does_not_silence(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    await _snooze(db_async, until_delta=timedelta(hours=-1))

    assert await _notify(db_async, user, suppress_within=None) == 1


async def test_entity_snooze_only_covers_that_entity(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    await _snooze(db_async, until_delta=timedelta(hours=1), entity_id="a")

    assert await _notify(db_async, user, entity_id="a", suppress_within=None) == 0
    assert await _notify(db_async, user, entity_id="b", suppress_within=None) == 1


async def test_other_organisation_snooze_is_ignored(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    await _snooze(db_async, until_delta=timedelta(hours=1), organisation_id="other")

    assert await _notify(db_async, user, suppress_within=None) == 1


async def test_snooze_endpoints(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    superuser = await db_async.scalar(
        select(User).where(User.email == str(settings.FIRST_SUPERUSER))
    )
    assert superuser is not None
    until = (utc_now() + timedelta(hours=2)).isoformat()

    created = await async_client.post(
        "/api/v1/notifications/snoozes?organisation_id=gaa",
        json={"event_key": EVENT, "until": until, "reason": "maintenance"},
        headers=superuser_token_headers_async,
    )
    assert created.status_code == 201, created.text
    snooze_id = created.json()["id"]

    listed = await async_client.get(
        "/api/v1/notifications/snoozes?organisation_id=gaa",
        headers=superuser_token_headers_async,
    )
    assert [s["id"] for s in listed.json()] == [snooze_id]

    assert await _notify(db_async, superuser, suppress_within=None) == 0

    deleted = await async_client.delete(
        f"/api/v1/notifications/snoozes/{snooze_id}?organisation_id=gaa",
        headers=superuser_token_headers_async,
    )
    assert deleted.status_code == 204
    assert await _notify(db_async, superuser, suppress_within=None) == 1


async def test_snooze_rejects_bad_input(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    past = (utc_now() - timedelta(hours=1)).isoformat()
    future = (utc_now() + timedelta(hours=1)).isoformat()
    url = "/api/v1/notifications/snoozes?organisation_id=gaa"

    ended = await async_client.post(
        url,
        json={"event_key": EVENT, "until": past},
        headers=superuser_token_headers_async,
    )
    unknown = await async_client.post(
        url,
        json={"event_key": "nope.nothing", "until": future},
        headers=superuser_token_headers_async,
    )
    half_entity = await async_client.post(
        url,
        json={"event_key": EVENT, "until": future, "entity_type": "test"},
        headers=superuser_token_headers_async,
    )

    assert (ended.status_code, unknown.status_code, half_entity.status_code) == (
        400,
        404,
        400,
    )


async def test_snooze_requires_manage_permission(
    async_client: httpx.AsyncClient,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    response = await async_client.post(
        "/api/v1/notifications/snoozes?organisation_id=gaa",
        json={
            "event_key": EVENT,
            "until": (utc_now() + timedelta(hours=1)).isoformat(),
        },
        headers=normal_user_token_headers_async,
    )

    assert response.status_code == 403


async def test_stalled_deliveries_are_counted(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    await notification_service.notify(
        db_async,
        event_key=EVENT,
        organisation_id="gaa",
        recipients=(user.id,),
        context=CONTEXT,
    )
    await db_async.commit()
    window = timedelta(minutes=10)
    baseline = await notification_service.count_stalled_deliveries(
        db_async, older_than=window
    )
    delivery = await db_async.scalar(
        select(NotificationDelivery)
        .join(Notification, Notification.id == NotificationDelivery.notification_id)
        .where(Notification.recipient_user_id == user.id)
    )
    assert delivery is not None
    assert delivery.status == DeliveryStatus.PENDING.value

    delivery.created_at = utc_now() - timedelta(minutes=30)
    await db_async.commit()

    assert (
        await notification_service.count_stalled_deliveries(db_async, older_than=window)
        == baseline + 1
    )
