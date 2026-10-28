"""GMS time-based notifications: sweeps are correct, scoped and idempotent.

The weather products, eRegister and NHC archive databases are separate in
production. These tests create just the columns each sweep reads as plain tables
in the test database, so the sweeps' SQL runs against a real PostgreSQL.
"""

import copy
import json
import uuid
from collections.abc import AsyncGenerator, Collection
from datetime import UTC, date, datetime, timedelta
from typing import cast

import pytest
from sqlalchemy import event, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import RoleAssignmentScope, User
from src.baseline import product_access
from src.baseline.models import ApprovalPolicy
from src.cap.models import CapAlert, CapLifecycleState
from src.cap.schemas import CapAlertAction, CapAlertCreate
from src.cap.service import approve_alert, create_alert, publish_alert, submit_alert
from src.eregister.models import ERegisterSend
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)
from src.notifications import gms, gms_sweeps
from src.notifications.models import Notification
from src.utils.datetime import utc_now
from tests.cap.test_cap_state_machine import _VALID_PAYLOAD_DICT
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)

# 11:20 UTC is 07:20 in Grenada (UTC-4): the morning forecast is 20 minutes late.
LATE_MORNING = datetime(2026, 10, 23, 11, 20, tzinfo=UTC)

TABLES = [
    "CREATE TABLE authored_products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"
    " kind text NOT NULL, published jsonb)",
    "CREATE TABLE register_observations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"
    " station_id text NOT NULL, kind text NOT NULL DEFAULT 'SYNOP',"
    " observed_at timestamptz NOT NULL, state text NOT NULL DEFAULT 'draft',"
    " actor_id text NOT NULL, review_outcome text, reviewed_at timestamptz)",
    "CREATE SCHEMA observations",
    "CREATE TABLE observations.stations (station_id text PRIMARY KEY,"
    " schedule text NOT NULL DEFAULT 'manual',"
    " manual_hours_utc smallint[] NOT NULL DEFAULT '{}',"
    " active boolean NOT NULL DEFAULT true)",
    "CREATE TABLE archive_nhc_events (id text PRIMARY KEY, product_key text NOT NULL,"
    " outcome text NOT NULL, retrieved_at timestamptz)",
]
DROP = [
    "DROP TABLE IF EXISTS authored_products",
    "DROP TABLE IF EXISTS register_observations",
    "DROP SCHEMA IF EXISTS observations CASCADE",
    "DROP TABLE IF EXISTS archive_nhc_events",
]


@pytest.fixture
async def sources(db_async: AsyncSession) -> AsyncGenerator[AsyncSession]:
    """The main test session also stands in for the three other databases."""
    for statement in [*DROP, *TABLES]:
        await db_async.execute(text(statement))
    await db_async.commit()
    try:
        yield db_async
    finally:
        await db_async.rollback()
        for statement in DROP:
            await db_async.execute(text(statement))
        await db_async.commit()


async def _staff(db: AsyncSession) -> User:
    user = await make_user(db)
    await make_department(db, "gms")
    await make_employee(db, user=user, department_id="gms")
    return user


_REAL_AUTHOR_CHECK = product_access.users_who_may_author


@pytest.fixture(autouse=True)
def _staff_may_author(monkeypatch: pytest.MonkeyPatch) -> None:
    """Grades are tested in baseline; here every GMS employee may author a kind."""

    async def everyone(
        _session: object, _kind: str, user_ids: Collection[uuid.UUID]
    ) -> set[uuid.UUID]:
        return set(user_ids)

    monkeypatch.setattr(product_access, "users_who_may_author", everyone)


async def _holder(db: AsyncSession, *permissions: str) -> User:
    role, _ = await make_role_with_permission(db, *permissions)
    user = await make_user(db)
    await assign_role(db, user=user, role=role, scope=RoleAssignmentScope.ALL)
    return user


async def _on_roster(
    db: AsyncSession, user: User, day: date, start: str, end: str
) -> None:
    """Put ``user`` on a published GMS roster with a work shift from start to end."""
    await make_department(db, "gms")
    code = f"T{uuid.uuid4().hex[:6]}".upper()
    db.add(
        ShiftCatalog(
            code=code,
            label="Test shift",
            category=ShiftCategory.WORK,
            start_time=start,
            end_time=end,
        )
    )
    period = RosterPeriod(
        department_id="gms",
        period_start=day,
        period_end=day,
        status=RosterPeriodStatus.PUBLISHED,
        created_by_user_id=user.id,
    )
    db.add(period)
    await db.flush()
    db.add(
        RosterAssignment(
            roster_period_id=period.id,
            user_id=user.id,
            assignment_date=day,
            shift_code=code,
        )
    )
    await db.commit()


async def _told(db: AsyncSession, user: User, key: str) -> list[Notification]:
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


# ── Forecast overdue ─────────────────────────────────────────────────────────


async def test_overdue_forecast_goes_to_the_forecaster_on_duty_once(
    sources: AsyncSession,
) -> None:
    on_duty = await _staff(sources)
    off_duty = await _staff(sources)
    await _on_roster(sources, on_duty, date(2026, 10, 23), "06:00", "18:00")

    assert await gms_sweeps.forecast_overdue(sources, sources, LATE_MORNING) == 1
    await sources.commit()
    assert await gms_sweeps.forecast_overdue(sources, sources, LATE_MORNING) == 0

    (told,) = await _told(sources, on_duty, gms.FORECAST_OVERDUE)
    assert told.title == "Morning forecast is overdue"
    assert told.in_bell
    assert await _told(sources, off_duty, gms.FORECAST_OVERDUE) == []


async def test_forecast_is_not_overdue_before_fifteen_minutes(
    sources: AsyncSession,
) -> None:
    staff = await _staff(sources)

    early = LATE_MORNING.replace(minute=10)
    assert await gms_sweeps.forecast_overdue(sources, sources, early) == 0
    assert await _told(sources, staff, gms.FORECAST_OVERDUE) == []


async def test_an_issued_forecast_is_not_overdue(sources: AsyncSession) -> None:
    staff = await _staff(sources)
    await sources.execute(
        text(
            "INSERT INTO authored_products (kind, published) VALUES ('morning', CAST(:p AS jsonb))"
        ),
        {"p": json.dumps({"values": {"issuedAt": "2026-10-23T07:00"}})},
    )
    await sources.commit()

    assert await gms_sweeps.forecast_overdue(sources, sources, LATE_MORNING) == 0
    assert await _told(sources, staff, gms.FORECAST_OVERDUE) == []


async def test_without_a_roster_every_forecaster_is_told(
    sources: AsyncSession,
) -> None:
    first, second = await _staff(sources), await _staff(sources)

    assert await gms_sweeps.forecast_overdue(sources, sources, LATE_MORNING) == 2
    assert len(await _told(sources, first, gms.FORECAST_OVERDUE)) == 1
    assert len(await _told(sources, second, gms.FORECAST_OVERDUE)) == 1


# ── Warning expiring ─────────────────────────────────────────────────────────


async def _published_warning(db: AsyncSession, author: User, expires: datetime):
    if await db.get(ApprovalPolicy, "cap") is None:
        db.add(ApprovalPolicy(key="cap", allow_self_approval=True))
        await db.commit()
    payload = copy.deepcopy(_VALID_PAYLOAD_DICT)
    payload["info"][0]["expires"] = expires.isoformat()
    alert = await create_alert(
        session=db, current_user=author, payload=CapAlertCreate(**payload)
    )
    for step in (submit_alert, approve_alert, publish_alert):
        await step(
            session=db,
            current_user=author,
            alert_id=alert.id,
            payload=CapAlertAction(),
        )
    return alert


async def test_warning_expiring_in_an_hour_tells_the_author_and_duty_staff_once(
    sources: AsyncSession,
) -> None:
    author = await make_user(sources, superuser=True)
    publisher = await _holder(sources, "cap.alert.publish")
    bystander = await _staff(sources)
    expires = datetime.now(UTC) + timedelta(hours=3)
    alert = await _published_warning(sources, author, expires)
    half_hour_before = expires - timedelta(minutes=30)

    assert await gms_sweeps.warning_expiring(sources, half_hour_before) == 2
    await sources.commit()
    assert await gms_sweeps.warning_expiring(sources, half_hour_before) == 0

    (told,) = await _told(sources, author, gms.WARNING_EXPIRING)
    # An expiring warning is a staff matter: open the workflow page, not the public one.
    assert told.link_path == f"/cap/admin/{alert.id}"
    assert len(await _told(sources, publisher, gms.WARNING_EXPIRING)) == 1
    assert await _told(sources, bystander, gms.WARNING_EXPIRING) == []


async def test_warning_more_than_an_hour_from_expiry_is_left_alone(
    sources: AsyncSession,
) -> None:
    author = await make_user(sources, superuser=True)
    expires = datetime.now(UTC) + timedelta(hours=3)
    await _published_warning(sources, author, expires)

    two_hours_before = expires - timedelta(hours=2)
    assert await gms_sweeps.warning_expiring(sources, two_hours_before) == 0


async def test_a_replaced_warning_does_not_expire_unannounced(
    sources: AsyncSession,
) -> None:

    author = await make_user(sources, superuser=True)
    expires = datetime.now(UTC) + timedelta(hours=3)
    alert = await _published_warning(sources, author, expires)
    row = await sources.get(CapAlert, alert.id)
    assert row is not None
    row.lifecycle_state = CapLifecycleState.EXPIRED
    await sources.commit()

    assert (
        await gms_sweeps.warning_expiring(sources, expires - timedelta(minutes=30)) == 0
    )


# ── Observation missing ──────────────────────────────────────────────────────

FIFTEEN_PAST = datetime(2026, 10, 23, 12, 15, tzinfo=UTC)
NOON = datetime(2026, 10, 23, 12, 0, tzinfo=UTC)


async def _add_observation(
    db: AsyncSession,
    *,
    observer: User,
    observed_at: datetime = NOON,
    state: str = "draft",
    review_outcome: str | None = None,
    reviewed_at: datetime | None = None,
) -> uuid.UUID:
    found = await db.scalar(
        text(
            "INSERT INTO register_observations (station_id, observed_at, state,"
            " actor_id, review_outcome, reviewed_at)"
            " VALUES ('78958', :at, :state, :actor, :outcome, :reviewed) RETURNING id"
        ),
        {
            "at": observed_at,
            "state": state,
            "actor": str(observer.id),
            "outcome": review_outcome,
            "reviewed": reviewed_at,
        },
    )
    await db.commit()
    assert found is not None
    return found


async def test_missing_hourly_observation_tells_the_observer_once(
    sources: AsyncSession,
) -> None:
    observer = await _holder(sources, "eregister.observe")
    await sources.execute(text("INSERT INTO observations.stations VALUES ('78958')"))
    await sources.commit()

    assert await gms_sweeps.observation_missing(sources, sources, FIFTEEN_PAST) == 1
    await sources.commit()
    # The next five-minute run, still inside the same hour.
    later = FIFTEEN_PAST + timedelta(minutes=5)
    assert await gms_sweeps.observation_missing(sources, sources, later) == 0

    (told,) = await _told(sources, observer, gms.OBSERVATION_MISSING)
    assert "12:00 UTC" in told.title


async def test_a_recorded_observation_is_not_missing(sources: AsyncSession) -> None:
    observer = await _holder(sources, "eregister.observe")
    await sources.execute(text("INSERT INTO observations.stations VALUES ('78958')"))
    await _add_observation(sources, observer=observer)

    assert await gms_sweeps.observation_missing(sources, sources, FIFTEEN_PAST) == 0


async def test_a_rejected_observation_still_counts_as_missing(
    sources: AsyncSession,
) -> None:
    observer = await _holder(sources, "eregister.observe")
    await sources.execute(text("INSERT INTO observations.stations VALUES ('78958')"))
    await _add_observation(sources, observer=observer, state="rejected")

    assert await gms_sweeps.observation_missing(sources, sources, FIFTEEN_PAST) == 1


async def test_observer_on_duty_gets_it_and_nobody_on_shift_tells_all_observers(
    sources: AsyncSession,
) -> None:
    on_duty = await _holder(sources, "eregister.observe")
    other = await _holder(sources, "eregister.observe")
    await sources.execute(text("INSERT INTO observations.stations VALUES ('78958')"))
    await sources.commit()
    # 12:15 UTC is 08:15 in Grenada: only the day shift is on duty.
    await _on_roster(sources, on_duty, date(2026, 10, 23), "06:00", "18:00")

    assert await gms_sweeps.observation_missing(sources, sources, FIFTEEN_PAST) == 1
    assert len(await _told(sources, on_duty, gms.OBSERVATION_MISSING)) == 1
    assert await _told(sources, other, gms.OBSERVATION_MISSING) == []

    # 02:15 in Grenada: the roster covers today but nobody is on shift, so
    # every holder of the permission to record observations is told.
    night = datetime(2026, 10, 23, 6, 15, tzinfo=UTC)
    assert await gms_sweeps.observation_missing(sources, sources, night) == 2
    assert len(await _told(sources, other, gms.OBSERVATION_MISSING)) == 1


# ── Register review requested and query ──────────────────────────────────────


async def test_accepted_unreviewed_record_asks_register_staff_other_than_the_observer(
    sources: AsyncSession,
) -> None:
    observer = await _holder(sources, "eregister.observe", "eregister.qc")
    reviewer = await _holder(sources, "eregister.qc")
    await _add_observation(sources, observer=observer, state="accepted")
    await _add_observation(
        sources, observer=observer, state="accepted", observed_at=NOON.replace(hour=11)
    )

    assert (
        await gms_sweeps.register_review_requested(sources, sources, FIFTEEN_PAST) == 2
    )
    await sources.commit()
    assert (
        await gms_sweeps.register_review_requested(sources, sources, FIFTEEN_PAST) == 0
    )

    # Two records fold into one notification with a count.
    (grouped,) = await _told(sources, reviewer, gms.REVIEW_REQUESTED)
    assert grouped.repeat_count == 2
    assert await _told(sources, observer, gms.REVIEW_REQUESTED) == []


async def test_a_reviewed_record_is_not_offered_for_review(
    sources: AsyncSession,
) -> None:
    observer = await _holder(sources, "eregister.observe")
    await _holder(sources, "eregister.qc")
    await _add_observation(
        sources,
        observer=observer,
        state="accepted",
        review_outcome="reviewed",
        reviewed_at=NOON,
    )

    assert (
        await gms_sweeps.register_review_requested(sources, sources, FIFTEEN_PAST) == 0
    )


async def test_a_query_tells_the_observer_once_and_a_new_query_tells_again(
    sources: AsyncSession,
) -> None:
    observer = await _holder(sources, "eregister.observe")
    bystander = await _holder(sources, "eregister.qc")
    record = await _add_observation(
        sources,
        observer=observer,
        state="accepted",
        review_outcome="query",
        reviewed_at=NOON + timedelta(minutes=5),
    )

    assert await gms_sweeps.record_query(sources, sources, FIFTEEN_PAST) == 1
    await sources.commit()
    assert await gms_sweeps.record_query(sources, sources, FIFTEEN_PAST) == 0
    assert await _told(sources, bystander, gms.RECORD_QUERY) == []

    # The reviewer replaces the review with a fresh query: the observer is told again.
    await sources.execute(
        text("UPDATE register_observations SET reviewed_at = :at WHERE id = :id"),
        {"at": NOON + timedelta(minutes=10), "id": record},
    )
    await sources.commit()
    assert await gms_sweeps.record_query(sources, sources, FIFTEEN_PAST) == 1
    assert len(await _told(sources, observer, gms.RECORD_QUERY)) == 2


# ── Send failed ──────────────────────────────────────────────────────────────


async def test_a_failed_wis2_publication_tells_senders_once_and_reaches_the_bell(
    sources: AsyncSession,
) -> None:
    sender = await _holder(sources, "eregister.send")
    sources.add(
        ERegisterSend(
            observation_id=uuid.uuid4(),
            station_id="78958",
            observed_at=utc_now() - timedelta(hours=1),
            target="wis2",
            status="failed",
            attempts=5,
        )
    )
    await sources.commit()

    assert await gms_sweeps.send_failed(sources) == 1
    await sources.commit()
    assert await gms_sweeps.send_failed(sources) == 0

    (told,) = await _told(sources, sender, gms.SEND_FAILED)
    assert told.title == "Send failed: WIS2 publication"
    assert told.in_bell


async def test_a_send_that_is_still_retrying_is_not_reported(
    sources: AsyncSession,
) -> None:
    sender = await _holder(sources, "eregister.send")
    sources.add(
        ERegisterSend(
            observation_id=uuid.uuid4(),
            station_id="78958",
            observed_at=utc_now(),
            target="email",
            status="queued",
            attempts=2,
        )
    )
    await sources.commit()

    assert await gms_sweeps.send_failed(sources) == 0
    assert await _told(sources, sender, gms.SEND_FAILED) == []


# ── National Hurricane Center product ────────────────────────────────────────


async def test_new_nhc_product_tells_gms_staff_once(sources: AsyncSession) -> None:
    staff = await _staff(sources)
    now = datetime.now(UTC)
    await sources.execute(
        text(
            "INSERT INTO archive_nhc_events VALUES"
            " ('e1', 'tropical-outlook', 'downloaded', :now),"
            " ('e2', 'tropical-outlook', 'checked_unchanged', :now)"
        ),
        {"now": now},
    )
    await sources.commit()

    assert await gms_sweeps.nhc_products(sources, sources, now) == 1
    await sources.commit()
    assert await gms_sweeps.nhc_products(sources, sources, now) == 0
    (told,) = await _told(sources, staff, gms.NHC_PRODUCT)
    assert told.body == "tropical-outlook was collected."


# ── Runner ───────────────────────────────────────────────────────────────────


class _Broken:
    async def execute(self, *args: object, **kwargs: object) -> None:
        raise RuntimeError("source down")

    scalar = execute


async def test_one_failing_source_does_not_stop_the_others(
    sources: AsyncSession,
) -> None:
    staff = await _staff(sources)
    now = datetime.now(UTC)
    await sources.execute(
        text(
            "INSERT INTO archive_nhc_events VALUES ('e1', 'outlook', 'downloaded', :now)"
        ),
        {"now": now},
    )
    await sources.commit()

    total = await gms_sweeps.run(
        sources,
        weather=cast(AsyncSession, _Broken()),
        register=cast(AsyncSession, _Broken()),
        archive=sources,
        now=now,
    )

    assert total == 1
    assert len(await _told(sources, staff, gms.NHC_PRODUCT)) == 1


async def test_an_unexpected_error_in_one_sweep_does_not_stop_the_next(
    sources: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    staff = await _staff(sources)
    now = datetime.now(UTC)
    await sources.execute(
        text(
            "INSERT INTO archive_nhc_events VALUES ('e1', 'outlook', 'downloaded', :now)"
        ),
        {"now": now},
    )
    await sources.commit()

    async def broken(*_args: object, **_kwargs: object) -> int:
        raise KeyError("surprise")

    monkeypatch.setattr(gms_sweeps, "warning_expiring", broken)
    monkeypatch.setattr(gms_sweeps, "send_failed", broken)

    total = await gms_sweeps.run(sources, archive=sources, now=now)

    assert total == 1
    assert len(await _told(sources, staff, gms.NHC_PRODUCT)) == 1


async def _nothing(*_args: object) -> set[uuid.UUID]:
    return set()


async def test_nobody_allowed_to_author_falls_back_to_senior_holders_not_all_staff(
    sources: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    ordinary = await _staff(sources)  # active GMS employee, no authoring grade
    senior = await _holder(sources, "eregister.qc")
    monkeypatch.setattr(product_access, "users_who_may_author", _nothing)

    assert await gms_sweeps.forecast_overdue(sources, sources, LATE_MORNING) == 1

    assert await _told(sources, ordinary, gms.FORECAST_OVERDUE) == []
    assert len(await _told(sources, senior, gms.FORECAST_OVERDUE)) == 1


# ── Follow-ups from the review of part 9 ─────────────────────────────────────


async def test_an_automatic_station_never_raises_a_missing_observation(
    sources: AsyncSession,
) -> None:
    await _holder(sources, "eregister.observe")
    await sources.execute(
        text("INSERT INTO observations.stations VALUES ('AWS01', 'automatic', '{}')")
    )
    await sources.commit()

    assert await gms_sweeps.observation_missing(sources, sources, FIFTEEN_PAST) == 0


async def test_an_inactive_station_never_raises_a_missing_observation(
    sources: AsyncSession,
) -> None:
    await _holder(sources, "eregister.observe")
    await sources.execute(
        text(
            "INSERT INTO observations.stations (station_id, active)"
            " VALUES ('OLD01', false)"
        )
    )
    await sources.commit()

    assert await gms_sweeps.observation_missing(sources, sources, FIFTEEN_PAST) == 0


async def test_a_hybrid_station_is_only_missing_in_its_manual_hours(
    sources: AsyncSession,
) -> None:
    await _holder(sources, "eregister.observe")
    await sources.execute(
        text("INSERT INTO observations.stations VALUES ('MIX01', 'hybrid', '{12}')")
    )
    await sources.commit()

    # 12:00 UTC is a manual hour; 13:00 UTC is the automatic station's.
    assert await gms_sweeps.observation_missing(sources, sources, FIFTEEN_PAST) == 1
    await sources.commit()
    later = FIFTEEN_PAST + timedelta(hours=1)
    assert await gms_sweeps.observation_missing(sources, sources, later) == 0


async def test_a_department_scoped_observer_hears_about_a_missing_observation(
    sources: AsyncSession,
) -> None:
    await make_department(sources, "gms")
    role, _ = await make_role_with_permission(sources, "eregister.observe")
    observer = await make_user(sources)
    await assign_role(
        sources,
        user=observer,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id="gms",
    )
    await sources.execute(text("INSERT INTO observations.stations VALUES ('78958')"))
    await sources.commit()

    assert await gms_sweeps.observation_missing(sources, sources, FIFTEEN_PAST) == 1

    assert len(await _told(sources, observer, gms.OBSERVATION_MISSING)) == 1


async def test_a_grant_scoped_to_another_department_hears_nothing(
    sources: AsyncSession,
) -> None:
    await make_department(sources, "gms")
    await make_department(sources, "other")
    role, _ = await make_role_with_permission(sources, "eregister.observe")
    outsider = await make_user(sources)
    await assign_role(
        sources,
        user=outsider,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id="other",
    )
    await sources.execute(text("INSERT INTO observations.stations VALUES ('78958')"))
    await sources.commit()

    assert await gms_sweeps.observation_missing(sources, sources, FIFTEEN_PAST) == 0


async def test_finding_the_duty_forecasters_does_not_query_per_staff_member(
    sources: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(product_access, "users_who_may_author", _REAL_AUTHOR_CHECK)

    async def count_statements() -> int:
        statements: list[str] = []

        def capture(_conn: object, _cursor: object, statement: str, *_rest: object):
            statements.append(statement)

        engine = sources.sync_session.get_bind()
        event.listen(engine, "before_cursor_execute", capture)
        try:
            await gms.duty_forecasters(sources, "morning", now=LATE_MORNING)
        finally:
            event.remove(engine, "before_cursor_execute", capture)
        return len(statements)

    await _staff(sources)
    few = await count_statements()
    for _ in range(5):
        await _staff(sources)
    assert await count_statements() == few
