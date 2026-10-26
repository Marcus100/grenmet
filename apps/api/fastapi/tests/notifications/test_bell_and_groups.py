"""Bell choice, urgent events and grouping in notify()."""

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.exceptions import AppException
from src.notifications import events
from src.notifications import service as notification_service
from src.notifications.events import EventDef
from src.notifications.models import (
    Notification,
    NotificationDelivery,
    NotificationOccurrence,
    NotificationPreference,
)
from src.notifications.schemas import NotificationPreferenceUpdate
from tests.factories import make_user

CALM = "test.calm"
GROUPED = "test.grouped"
URGENT = "test.urgent"


def _register() -> None:
    base = {"audience": "tests", "title": "T {{ n }}", "body": "B {{ n }}"}
    events.register(
        EventDef(key=CALM, label="Calm", description="d", variables=("n",), **base)
    )
    events.register(
        EventDef(
            key=GROUPED,
            label="Grouped",
            description="d",
            variables=("n",),
            grouped=True,
            **base,
        )
    )
    events.register(
        EventDef(
            key=URGENT,
            label="Urgent",
            description="d",
            variables=("n",),
            urgent=True,
            **base,
        )
    )


_register()


async def _send(
    db: AsyncSession,
    user: User,
    key: str,
    n: int = 1,
    *,
    dedupe_key: str | None = None,
) -> int:
    sent = await notification_service.notify(
        db,
        event_key=key,
        organisation_id="gaa",
        recipients=(user.id,),
        context={"n": n},
        dedupe_key=dedupe_key,
    )
    await db.commit()
    return sent


async def _prefer(db: AsyncSession, user: User, key: str, **choice: bool) -> None:
    await notification_service.update_preferences(
        session=db,
        user=user,
        payload=[NotificationPreferenceUpdate(event_key=key, **choice)],
    )


async def _rows(db: AsyncSession, user: User, key: str) -> list[Notification]:
    return list(
        (
            await db.execute(
                select(Notification).where(
                    Notification.recipient_user_id == user.id,
                    Notification.event_key == key,
                )
            )
        ).scalars()
    )


async def _emails(db: AsyncSession, user: User) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(NotificationDelivery)
            .join(Notification, Notification.id == NotificationDelivery.notification_id)
            .where(Notification.recipient_user_id == user.id)
        )
        or 0
    )


async def test_default_is_bell_and_email(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    assert await _send(db_async, user, CALM) == 1
    (row,) = await _rows(db_async, user, CALM)
    assert row.in_bell
    assert await _emails(db_async, user) == 1


async def test_bell_off_keeps_the_email_but_hides_it_from_the_bell(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    await _prefer(db_async, user, CALM, bell_enabled=False)
    await _send(db_async, user, CALM)

    (row,) = await _rows(db_async, user, CALM)
    assert not row.in_bell
    assert await _emails(db_async, user) == 1
    inbox = await notification_service.list_inbox(session=db_async, user=user)
    assert inbox.count == 0
    unread = await notification_service.unread_count(session=db_async, user=user)
    assert unread.count == 0


async def test_both_channels_off_creates_nothing(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    await _prefer(db_async, user, CALM, bell_enabled=False, email_enabled=False)

    assert await _send(db_async, user, CALM) == 0
    assert await _rows(db_async, user, CALM) == []


async def test_email_off_keeps_the_bell(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    await _prefer(db_async, user, CALM, email_enabled=False)
    await _send(db_async, user, CALM)

    (row,) = await _rows(db_async, user, CALM)
    assert row.in_bell
    assert await _emails(db_async, user) == 0


async def test_urgent_event_always_reaches_the_bell(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    # Stored directly: the API refuses to turn an urgent bell off.
    db_async.add(
        NotificationPreference(
            user_id=user.id, event_key=URGENT, bell_enabled=False, email_enabled=False
        )
    )
    await db_async.commit()

    assert await _send(db_async, user, URGENT) == 1
    inbox = await notification_service.list_inbox(session=db_async, user=user)
    assert inbox.count == 1
    assert inbox.data[0].urgent


async def test_urgent_bell_cannot_be_turned_off_through_preferences(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    with pytest.raises(AppException):
        await _prefer(db_async, user, URGENT, bell_enabled=False)
    listed = {
        p.event_key: p
        for p in await notification_service.list_preferences(
            session=db_async, user=user
        )
    }
    assert listed[URGENT].bell_enabled
    assert not listed[URGENT].bell_mutable
    assert listed[CALM].bell_mutable


async def test_grouped_repeats_fold_into_one_unread_notification(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    await _send(db_async, user, GROUPED, 1)
    await _send(db_async, user, GROUPED, 2)
    await _send(db_async, user, GROUPED, 3)

    (row,) = await _rows(db_async, user, GROUPED)
    assert row.repeat_count == 3
    assert row.title == "T 3"
    # One email for the group, not one per repeat.
    assert await _emails(db_async, user) == 1
    unread = await notification_service.unread_count(session=db_async, user=user)
    assert unread.count == 1


async def test_a_read_group_starts_again(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    await _send(db_async, user, GROUPED, 1)
    (first,) = await _rows(db_async, user, GROUPED)
    await notification_service.mark_read(
        session=db_async, user=user, notification_id=first.id
    )

    await _send(db_async, user, GROUPED, 2)

    assert len(await _rows(db_async, user, GROUPED)) == 2


async def test_grouped_dedupe_key_counts_each_item_once(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    assert await _send(db_async, user, GROUPED, 1, dedupe_key="item:1") == 1
    assert await _send(db_async, user, GROUPED, 2, dedupe_key="item:2") == 1
    # The sweep runs again over the same two items: nothing changes.
    assert await _send(db_async, user, GROUPED, 1, dedupe_key="item:1") == 0
    assert await _send(db_async, user, GROUPED, 2, dedupe_key="item:2") == 0

    (row,) = await _rows(db_async, user, GROUPED)
    assert row.repeat_count == 2
    occurrences = await db_async.scalar(
        select(func.count()).select_from(NotificationOccurrence)
    )
    assert occurrences == 2


async def test_bell_off_recipient_gets_an_email_for_every_grouped_occurrence(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    await _prefer(db_async, user, GROUPED, bell_enabled=False, email_enabled=True)
    assert await _send(db_async, user, GROUPED, 1, dedupe_key="hour:1") == 1
    assert await _send(db_async, user, GROUPED, 2, dedupe_key="hour:2") == 1

    rows = await _rows(db_async, user, GROUPED)
    assert len(rows) == 2
    assert not any(row.in_bell for row in rows)
    assert await _emails(db_async, user) == 2


async def test_fold_adds_one_in_sql_rather_than_overwriting_the_count(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    await _send(db_async, user, GROUPED, 1)
    (row,) = await _rows(db_async, user, GROUPED)
    # Another worker folded four more repeats after this session loaded the row.
    await db_async.execute(
        text("UPDATE notification SET repeat_count = 5 WHERE id = :id"),
        {"id": row.id},
    )

    await notification_service.notify(
        db_async,
        event_key=GROUPED,
        organisation_id="gaa",
        recipients=(user.id,),
        context={"n": 2},
    )

    assert row.repeat_count == 6


async def test_both_channels_off_still_remembers_each_grouped_item(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    await _prefer(db_async, user, GROUPED, bell_enabled=False, email_enabled=False)
    assert await _send(db_async, user, GROUPED, 1, dedupe_key="hour:1") == 0

    # No notification and no email, but the item is on record.
    assert await _rows(db_async, user, GROUPED) == []
    assert await _emails(db_async, user) == 0
    assert (
        await db_async.scalar(select(func.count()).select_from(NotificationOccurrence))
        == 1
    )

    # The person turns email back on while the sweep still sees the same item.
    await _prefer(db_async, user, GROUPED, bell_enabled=True, email_enabled=True)
    assert await _send(db_async, user, GROUPED, 1, dedupe_key="hour:1") == 0
    assert await _rows(db_async, user, GROUPED) == []
    # A genuinely new item does notify.
    assert await _send(db_async, user, GROUPED, 2, dedupe_key="hour:2") == 1
