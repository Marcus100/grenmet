"""The system expires published warnings once every info block has ended."""

import asyncio
from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap import cache, escalation, expiry
from src.cap.escalation import RAISE_BLOCKING_STATES, SOURCE_ID
from src.cap.models import (
    CapAlert,
    CapAuditEvent,
    CapCertainty,
    CapInfo,
    CapLifecycleState,
    CapMessageType,
    CapScope,
    CapSeverity,
    CapStatus,
    CapUrgency,
)
from src.cap.schemas import CapAuditEventPublic
from src.database import async_session_factory
from src.utils.datetime import utc_now
from tests.factories import make_user

pytestmark = pytest.mark.asyncio

PAST = timedelta(hours=2)
FUTURE = timedelta(hours=2)


@pytest.fixture
def invalidated(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, ...]]:
    calls: list[tuple[str, ...]] = []

    async def record(*keys: str) -> None:
        calls.append(keys)

    monkeypatch.setattr(cache, "invalidate", record)
    return calls


async def seed(
    db: AsyncSession,
    *,
    expires: list[timedelta | None],
    state: CapLifecycleState = CapLifecycleState.PUBLISHED,
    msg_type: CapMessageType = CapMessageType.ALERT,
    parameters: list[dict[str, str]] | None = None,
) -> CapAlert:
    """A stored alert with one info block per entry; ``None`` means no expiry."""
    creator = await make_user(db)
    now = utc_now()
    alert = CapAlert(
        identifier=f"auto-expire-{uuid4()}",
        sender="cap@example.com",
        status=CapStatus.ACTUAL,
        msg_type=msg_type,
        scope=CapScope.PUBLIC,
        lifecycle_state=state,
        created_by_user_id=creator.id,
    )
    db.add(alert)
    await db.flush()
    for sequence, offset in enumerate(expires):
        db.add(
            CapInfo(
                alert_id=alert.id,
                sequence=sequence,
                event="Gale Warning",
                urgency=CapUrgency.EXPECTED,
                severity=CapSeverity.SEVERE,
                certainty=CapCertainty.LIKELY,
                headline="Gale winds",
                description="Warning",
                effective=now - timedelta(days=1),
                expires=None if offset is None else now + offset,
                parameters=parameters or [],
            )
        )
    await db.commit()
    await db.refresh(alert)
    return alert


async def reload(db: AsyncSession, alert_id: UUID) -> CapAlert:
    result = await db.execute(
        select(CapAlert)
        .where(CapAlert.id == alert_id)
        .execution_options(populate_existing=True)
    )
    return result.scalars().one()


async def audit_rows(db: AsyncSession, alert_id: UUID) -> list[CapAuditEvent]:
    result = await db.execute(
        select(CapAuditEvent).where(CapAuditEvent.alert_id == alert_id)
    )
    return list(result.scalars().all())


async def test_expires_a_published_alert_whose_every_info_has_ended(
    db_async: AsyncSession, invalidated: list[tuple[str, ...]]
) -> None:
    alert = await seed(db_async, expires=[-PAST, -PAST])
    assert await expiry.expire_due_alerts(session=db_async) >= 1

    stored = await reload(db_async, alert.id)
    assert stored.lifecycle_state == CapLifecycleState.EXPIRED
    assert stored.expired_at is not None

    rows = await audit_rows(db_async, alert.id)
    assert len(rows) == 1
    row = rows[0]
    assert row.action == "expire"
    assert row.actor_user_id is None
    assert (row.previous_state, row.next_state) == ("PUBLISHED", "EXPIRED")
    assert row.note == "expired by the system: end time passed"
    assert row.payload == {"actor": "system"}

    # The audit row renders through the staff schema with no actor.
    public = CapAuditEventPublic.model_validate(row, from_attributes=True)
    assert public.actor_user_id is None

    # Public caches drop the alert, as a manual expiry does.
    assert invalidated
    assert any(stored.identifier in key for keys in invalidated for key in keys)


async def test_an_alert_with_one_info_still_in_the_future_is_untouched(
    db_async: AsyncSession,
) -> None:
    alert = await seed(db_async, expires=[-PAST, FUTURE])
    await expiry.expire_due_alerts(session=db_async)
    assert (await reload(db_async, alert.id)).lifecycle_state == (
        CapLifecycleState.PUBLISHED
    )
    assert await audit_rows(db_async, alert.id) == []


async def test_an_info_without_an_expiry_keeps_the_alert_published(
    db_async: AsyncSession,
) -> None:
    alert = await seed(db_async, expires=[-PAST, None])
    await expiry.expire_due_alerts(session=db_async)
    assert (await reload(db_async, alert.id)).lifecycle_state == (
        CapLifecycleState.PUBLISHED
    )


async def test_an_alert_with_no_info_block_is_untouched(db_async: AsyncSession) -> None:
    alert = await seed(db_async, expires=[])
    await expiry.expire_due_alerts(session=db_async)
    assert (await reload(db_async, alert.id)).lifecycle_state == (
        CapLifecycleState.PUBLISHED
    )


@pytest.mark.parametrize(
    "state",
    [
        CapLifecycleState.DRAFT,
        CapLifecycleState.SUBMITTED,
        CapLifecycleState.APPROVED,
        CapLifecycleState.CANCELLED,
        CapLifecycleState.EXPIRED,
    ],
)
async def test_non_published_states_are_never_touched(
    state: CapLifecycleState, db_async: AsyncSession
) -> None:
    alert = await seed(db_async, expires=[-PAST], state=state)
    await expiry.expire_due_alerts(session=db_async)
    assert (await reload(db_async, alert.id)).lifecycle_state == state
    assert await audit_rows(db_async, alert.id) == []


@pytest.mark.parametrize("msg_type", [CapMessageType.CANCEL, CapMessageType.ACK])
async def test_cancel_and_ack_messages_are_never_expired(
    msg_type: CapMessageType, db_async: AsyncSession
) -> None:
    alert = await seed(db_async, expires=[-PAST], msg_type=msg_type)
    await expiry.expire_due_alerts(session=db_async)
    assert (await reload(db_async, alert.id)).lifecycle_state == (
        CapLifecycleState.PUBLISHED
    )


async def test_an_update_whose_infos_have_ended_expires(
    db_async: AsyncSession,
) -> None:
    alert = await seed(db_async, expires=[-PAST], msg_type=CapMessageType.UPDATE)
    await expiry.expire_due_alerts(session=db_async)
    assert (await reload(db_async, alert.id)).lifecycle_state == (
        CapLifecycleState.EXPIRED
    )


async def test_a_second_run_is_a_no_op(db_async: AsyncSession) -> None:
    alert = await seed(db_async, expires=[-PAST])
    assert await expiry.expire_due_alerts(session=db_async) >= 1
    before = len(await audit_rows(db_async, alert.id))
    assert await expiry.expire_due_alerts(session=db_async) == 0
    assert len(await audit_rows(db_async, alert.id)) == before == 1


async def test_concurrent_runs_expire_each_alert_once(db_async: AsyncSession) -> None:
    alerts = [await seed(db_async, expires=[-PAST]) for _ in range(5)]
    untouched = await seed(db_async, expires=[FUTURE])

    async def run() -> int:
        async with async_session_factory() as session:
            return await expiry.expire_due_alerts(session=session)

    results = await asyncio.gather(run(), run(), run())
    assert sum(results) == len(alerts)
    for alert in alerts:
        assert (await reload(db_async, alert.id)).lifecycle_state == (
            CapLifecycleState.EXPIRED
        )
        assert len(await audit_rows(db_async, alert.id)) == 1
    assert (await reload(db_async, untouched.id)).lifecycle_state == (
        CapLifecycleState.PUBLISHED
    )


async def test_a_raise_is_allowed_once_the_old_warning_has_expired(
    db_async: AsyncSession,
) -> None:
    product_id = uuid4()
    parameters = [{"value_name": SOURCE_ID, "value": str(product_id)}]
    alert = await seed(db_async, expires=[-PAST], parameters=parameters)

    before = await escalation.find_linked_alert(
        db_async, product_id, RAISE_BLOCKING_STATES
    )
    assert before == (alert.id, CapLifecycleState.PUBLISHED)

    await expiry.expire_due_alerts(session=db_async)
    after = await escalation.find_linked_alert(
        db_async, product_id, RAISE_BLOCKING_STATES
    )
    assert after is None


async def test_the_worker_runs_the_expiry_job_on_a_schedule() -> None:
    from src import operational_metrics
    from src.worker import main
    from src.worker.cron_monitor import MONITORED

    assert main.expire_cap_alerts.__name__ in MONITORED
    assert "expire_cap_alerts" in operational_metrics.JOBS
    scheduled = [
        job.coroutine.__name__
        for job in main.WorkerSettings.cron_jobs
        if job.coroutine.__name__ == "expire_cap_alerts"
    ]
    assert scheduled == ["expire_cap_alerts"]
