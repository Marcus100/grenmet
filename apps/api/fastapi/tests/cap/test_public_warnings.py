from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import pytest
from fakeredis import FakeAsyncRedis
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap import cache, public_queries, service
from src.cap.mapping import _alert_selectinload_options, _to_public_from_loaded
from src.cap.models import (
    CapAlert,
    CapCertainty,
    CapInfo,
    CapLifecycleState,
    CapMessageType,
    CapScope,
    CapSeverity,
    CapStatus,
    CapUrgency,
)
from src.cap.schemas import CapAlertPublic, CapInfoPublic
from src.utils.datetime import utc_now
from tests.factories import make_user

NOW = datetime(2026, 9, 17, 12, tzinfo=UTC)


@pytest.fixture(autouse=True)
def no_shared_redis_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    # The warnings response is cached in Redis when REDIS_URL is set; keep
    # each test on its own uncached path. Tests that need the cache opt in.
    monkeypatch.setattr(cache, "_get_client", lambda: None)


def info(**changes):
    values = {
        "id": uuid4(),
        "sequence": 0,
        "language": "en",
        "event": "Gale Warning",
        "headline": "Gale winds",
        "description": "Warning",
        "expires": NOW + timedelta(hours=1),
    }
    return CapInfoPublic.model_validate({**values, **changes})


def alert(**changes):
    values = {
        "id": uuid4(),
        "identifier": str(uuid4()),
        "sender": "GMS",
        "sent": NOW,
        "status": "Actual",
        "scope": "Public",
        "msg_type": "Alert",
        "lifecycle_state": "PUBLISHED",
        "created_by_user_id": uuid4(),
        "created_at": NOW,
        "updated_at": NOW,
        "info": [info()],
    }
    return CapAlertPublic.model_validate({**values, **changes})


def test_groups_sort_and_preserve_unknown_events():
    result = service.select_public_warnings(
        [
            alert(identifier="minor", info=[info(severity="Minor")]),
            alert(identifier="extreme", info=[info(severity="Extreme")]),
            alert(identifier="ash", info=[info(event="Volcanic ash")]),
        ],
        NOW,
    )
    assert result.activeCount == 3
    assert [
        item.identifier
        for item in next(g for g in result.groups if g.name == "Wind").alerts
    ] == ["extreme", "minor"]
    assert result.groups[-1].name == "Other warnings"
    assert result.groups[-1].alerts[0].identifier == "ash"
    assert service.select_public_warnings([], NOW).activeCount == 0


def test_public_warnings_carry_the_gms_product_and_colour():
    result = service.select_public_warnings(
        [
            alert(
                identifier="orange",
                info=[
                    info(
                        severity="Severe",
                        parameters=[
                            {"value_name": "GMS:product", "value": "Watch"},
                            {
                                "value_name": "awareness_level",
                                "value": "3; orange; Severe",
                            },
                        ],
                    )
                ],
            ),
            alert(
                identifier="outlook",
                info=[
                    info(parameters=[{"value_name": "GMS:product", "value": "Outlook"}])
                ],
            ),
            alert(identifier="legacy"),
        ],
        NOW,
    )
    wind = {
        w.identifier: w
        for w in next(g for g in result.groups if g.name == "Wind").alerts
    }
    assert (wind["orange"].product, wind["orange"].colour) == ("Watch", "orange")
    assert (wind["outlook"].product, wind["outlook"].colour) == ("Outlook", None)
    assert (wind["legacy"].product, wind["legacy"].colour) == (None, None)


@pytest.mark.parametrize(
    "changes",
    [
        {"scope": "Private"},
        {"scope": "Restricted"},
        {"lifecycle_state": "DRAFT"},
        {"lifecycle_state": "CANCELLED"},
        {"msg_type": "Cancel"},
        {"msg_type": "Ack"},
        {"sent": NOW + timedelta(seconds=1)},
        {"info": [info(expires=NOW)]},
        {"info": [info(effective=NOW + timedelta(seconds=1))]},
    ],
)
def test_ineligible_alerts_are_excluded(changes):
    assert service.select_public_warnings([alert(**changes)], NOW).activeCount == 0


def test_active_language_selection_does_not_use_expired_first_info():
    bulletin = alert(
        info=[
            info(language="fr", sequence=0, expires=NOW),
            info(
                sequence=1,
                headline="Current English",
                onset=NOW + timedelta(hours=1),
                expires=NOW + timedelta(hours=2),
            ),
        ]
    )
    result = service.select_public_warnings([bulletin], NOW)
    assert result.activeCount == 1
    assert (
        next(g for g in result.groups if g.alerts).alerts[0].headline
        == "Current English"
    )


@pytest.mark.parametrize("status", ["Exercise", "Test", "System", "Draft"])
def test_status_is_preserved(status):
    result = service.select_public_warnings([alert(status=status)], NOW)
    assert next(g for g in result.groups if g.alerts).alerts[0].status == status


def test_unknown_status_is_not_actual():
    with pytest.raises(ValidationError):
        alert(status="invalid")


async def test_endpoint_and_failure(async_client: httpx.AsyncClient, monkeypatch):
    async def selection(**_kwargs):
        return service.select_public_warnings([alert(status="Exercise")], NOW)

    monkeypatch.setattr(service, "public_warnings", selection)
    response = await async_client.get("/api/cap/warnings")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["activeCount"] == 0

    async def unavailable(**_kwargs):
        raise OSError("database unavailable")

    monkeypatch.setattr(service, "public_warnings", unavailable)
    response = await async_client.get("/api/cap/warnings")
    assert response.status_code == 503
    assert "groups" not in response.json()


async def test_warning_query_excludes_restricted_records(
    async_client,
    db_async,
    superuser_token_headers_async,
    second_superuser_headers_async: dict[str, str],
):
    from src.baseline.models import ApprovalPolicy
    from tests.cap.test_cap_public_scope import _publish_alert

    db_async.add(ApprovalPolicy(key="cap", allow_self_approval=True))
    await db_async.commit()
    public = await _publish_alert(
        async_client,
        superuser_token_headers_async,
        second_superuser_headers_async,
        scope="Public",
    )
    private = await _publish_alert(
        async_client,
        superuser_token_headers_async,
        second_superuser_headers_async,
        scope="Restricted",
        restriction="Staff",
    )
    response = await async_client.get("/api/cap/warnings")
    assert response.status_code == 200, response.text
    identifiers = [
        item["identifier"]
        for group in response.json()["groups"]
        for item in group["alerts"]
    ]
    assert public in identifiers
    assert private not in identifiers


async def _seed_published(
    db: AsyncSession,
    *,
    creator_id,
    identifier: str,
    effective: datetime,
    expires: datetime,
) -> None:
    alert = CapAlert(
        identifier=identifier,
        sender="cap@example.com",
        status=CapStatus.ACTUAL,
        msg_type=CapMessageType.ALERT,
        scope=CapScope.PUBLIC,
        lifecycle_state=CapLifecycleState.PUBLISHED,
        created_by_user_id=creator_id,
    )
    db.add(alert)
    await db.flush()
    db.add(
        CapInfo(
            alert_id=alert.id,
            sequence=0,
            event="Gale Warning",
            urgency=CapUrgency.EXPECTED,
            severity=CapSeverity.SEVERE,
            certainty=CapCertainty.LIKELY,
            headline="Gale winds",
            description="Warning",
            effective=effective,
            expires=expires,
            parameters=[],
        )
    )
    await db.commit()


async def test_warning_query_loads_only_alerts_in_effect(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Published alerts never move to EXPIRED by themselves, so the query must
    # filter by time in SQL; otherwise every alert ever published is loaded.
    creator = await make_user(db_async)
    now = utc_now()
    active = f"active-{uuid4()}"
    expired = f"expired-{uuid4()}"
    not_yet = f"not-yet-{uuid4()}"
    await _seed_published(
        db_async,
        creator_id=creator.id,
        identifier=active,
        effective=now - timedelta(hours=1),
        expires=now + timedelta(hours=1),
    )
    await _seed_published(
        db_async,
        creator_id=creator.id,
        identifier=expired,
        effective=now - timedelta(days=2),
        expires=now - timedelta(days=1),
    )
    await _seed_published(
        db_async,
        creator_id=creator.id,
        identifier=not_yet,
        effective=now + timedelta(hours=1),
        expires=now + timedelta(hours=2),
    )

    loaded: list[str] = []
    original = public_queries._to_public_from_loaded

    def record(alert, **kwargs):
        loaded.append(alert.identifier)
        return original(alert, **kwargs)

    monkeypatch.setattr(public_queries, "_to_public_from_loaded", record)
    result = await service.public_warnings(session=db_async)

    assert active in loaded
    assert expired not in loaded
    assert not_yet not in loaded
    shown = [item.identifier for group in result.groups for item in group.alerts]
    assert active in shown
    assert expired not in shown
    assert not_yet not in shown


async def test_public_warnings_response_is_cached_briefly(
    async_client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeAsyncRedis(decode_responses=True)
    monkeypatch.setattr(cache, "_get_client", lambda: fake)
    calls = 0

    async def selection(**_kwargs):
        nonlocal calls
        calls += 1
        return service.select_public_warnings([alert(status="Exercise")], NOW)

    monkeypatch.setattr(service, "public_warnings", selection)
    first = await async_client.get("/api/cap/warnings")
    second = await async_client.get("/api/cap/warnings")
    assert first.status_code == second.status_code == 200
    assert second.json()["activeCount"] == 0
    assert second.headers["cache-control"] == "no-store"
    assert calls == 1


async def _seed_alert(
    db: AsyncSession,
    *,
    creator_id,
    identifier: str,
    infos: list[tuple[datetime | None, datetime | None]],
    msg_type: CapMessageType = CapMessageType.ALERT,
) -> None:
    """A published public alert with one information block per (effective, expires)."""
    alert = CapAlert(
        identifier=identifier,
        sender="cap@example.com",
        status=CapStatus.ACTUAL,
        msg_type=msg_type,
        scope=CapScope.PUBLIC,
        lifecycle_state=CapLifecycleState.PUBLISHED,
        created_by_user_id=creator_id,
    )
    db.add(alert)
    await db.flush()
    for sequence, (effective, expires) in enumerate(infos):
        db.add(
            CapInfo(
                alert_id=alert.id,
                sequence=sequence,
                event="Gale Warning",
                urgency=CapUrgency.EXPECTED,
                severity=CapSeverity.SEVERE,
                certainty=CapCertainty.LIKELY,
                headline=f"Headline {sequence}",
                description="Warning",
                effective=effective,
                expires=expires,
                parameters=[],
            )
        )
    await db.commit()


async def _unfiltered_public_warnings(db: AsyncSession, clock: datetime):
    """The reference result: every published public alert, selected in Python only."""
    rows = (
        (
            await db.execute(
                select(CapAlert)
                .where(
                    CapAlert.lifecycle_state == CapLifecycleState.PUBLISHED,
                    CapAlert.scope == CapScope.PUBLIC,
                )
                .options(*_alert_selectinload_options())
            )
        )
        .scalars()
        .all()
    )
    return public_queries.select_public_warnings(
        [_to_public_from_loaded(row, redact_internal=True) for row in rows], clock
    )


def _shown(result) -> list[tuple[str, str, str]]:
    """Group, identifier and headline of every shown warning, in order."""
    return [
        (group.name, alert.identifier, alert.headline)
        for group in result.groups
        for alert in group.alerts
    ]


NOW_NAIVE = datetime.now(UTC).replace(tzinfo=None)


@pytest.mark.parametrize(
    ("infos", "msg_type", "shown"),
    [
        # expires is null: no end, so in effect once effective has passed.
        ([(NOW_NAIVE - timedelta(hours=1), None)], CapMessageType.ALERT, True),
        # effective is null: in effect from the start until expires.
        ([(None, NOW_NAIVE + timedelta(hours=1))], CapMessageType.ALERT, True),
        # both null: no bounds at all.
        ([(None, None)], CapMessageType.ALERT, True),
        # both null on an Update.
        ([(None, None)], CapMessageType.UPDATE, True),
        # a cancellation is never shown, even when its block is in effect.
        (
            [(NOW_NAIVE - timedelta(hours=1), NOW_NAIVE + timedelta(hours=1))],
            CapMessageType.CANCEL,
            False,
        ),
        # one block expired, one in effect: the alert shows with the active block.
        (
            [
                (NOW_NAIVE - timedelta(days=2), NOW_NAIVE - timedelta(days=1)),
                (NOW_NAIVE - timedelta(hours=1), NOW_NAIVE + timedelta(hours=1)),
            ],
            CapMessageType.ALERT,
            True,
        ),
        # one block in effect, one not yet started: still shown.
        (
            [
                (NOW_NAIVE - timedelta(hours=1), NOW_NAIVE + timedelta(hours=1)),
                (NOW_NAIVE + timedelta(days=1), NOW_NAIVE + timedelta(days=2)),
            ],
            CapMessageType.ALERT,
            True,
        ),
        # every block expired: not shown.
        (
            [(NOW_NAIVE - timedelta(days=2), NOW_NAIVE - timedelta(days=1))],
            CapMessageType.ALERT,
            False,
        ),
        # every block not yet started: not shown.
        (
            [(NOW_NAIVE + timedelta(hours=1), NOW_NAIVE + timedelta(hours=2))],
            CapMessageType.ALERT,
            False,
        ),
    ],
)
async def test_sql_filter_matches_python_selection(
    db_async: AsyncSession, infos, msg_type, shown: bool
) -> None:
    creator = await make_user(db_async)
    identifier = f"edge-{uuid4()}"
    await _seed_alert(
        db_async,
        creator_id=creator.id,
        identifier=identifier,
        infos=infos,
        msg_type=msg_type,
    )
    result = await service.public_warnings(session=db_async)
    reference = await _unfiltered_public_warnings(db_async, datetime.now(UTC))

    shown_identifiers = [item[1] for item in _shown(result)]
    assert (identifier in shown_identifiers) is shown
    # Same answer as selecting in Python from every published alert.
    assert [item[:2] for item in _shown(result)] == [
        item[:2] for item in _shown(reference)
    ]
    assert [item[2] for item in _shown(result) if item[1] == identifier] == [
        item[2] for item in _shown(reference) if item[1] == identifier
    ]


async def test_cancel_and_publish_invalidate_the_cached_warnings(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
    second_superuser_headers_async: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The real publish and cancel routes must delete the cached warnings key;
    # a stale key here would show a withdrawn warning until the TTL ends.
    from src.baseline.models import ApprovalPolicy
    from tests.cap.test_cap_public_scope import _publish_alert

    fake = FakeAsyncRedis(decode_responses=True)
    monkeypatch.setattr(cache, "_get_client", lambda: fake)
    db_async.add(ApprovalPolicy(key="cap", allow_self_approval=True))
    await db_async.commit()

    await fake.set(cache.PUBLIC_WARNINGS, '{"stale": true}')
    identifier = await _publish_alert(
        async_client,
        superuser_token_headers_async,
        second_superuser_headers_async,
        scope="Public",
    )
    assert await fake.get(cache.PUBLIC_WARNINGS) is None, "publish left the cache"

    await fake.set(cache.PUBLIC_WARNINGS, '{"stale": true}')
    alert_id = (
        await db_async.execute(
            select(CapAlert.id).where(CapAlert.identifier == identifier)
        )
    ).scalar_one()
    response = await async_client.post(
        f"/api/v1/cap/alerts/{alert_id}/cancel",
        headers=superuser_token_headers_async,
        json={"note": "Withdrawn in error"},
    )
    assert response.status_code == 200, response.text
    assert await fake.get(cache.PUBLIC_WARNINGS) is None, "cancel left the cache"
