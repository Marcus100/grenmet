"""CAP "sent" is the publish time; the CAP settings OID must be a WMO OID."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.baseline.models import ApprovalPolicy
from src.cap import service as cap_service
from src.cap.models import CapAlert, CapSnapshot
from src.cap.schemas import (
    CapAlertAction,
    CapAlertCreate,
    CapPublishAction,
    CapReferenceCreate,
    CapSettingsUpdate,
)
from src.cap.xml import _format_cap_datetime
from tests.cap.test_cap_state_machine import _VALID_PAYLOAD_DICT
from tests.factories import make_user

DRAFTED = datetime(2026, 10, 31, 9, 0, 0)
PUBLISHED = datetime(2026, 10, 31, 10, 15, 0)
UPDATED = datetime(2026, 10, 31, 11, 40, 0)


def _at(monkeypatch: pytest.MonkeyPatch, when: datetime) -> None:
    monkeypatch.setattr(cap_service, "utc_now", lambda: when)


async def _snapshot_xml(db: AsyncSession, snapshot_id) -> str:
    row = await db.get(CapSnapshot, snapshot_id)
    assert row is not None
    return row.xml


async def _policy(db: AsyncSession) -> None:
    if await db.get(ApprovalPolicy, "cap") is None:
        db.add(ApprovalPolicy(key="cap", allow_self_approval=True))
        await db.commit()


async def _approve(db: AsyncSession, user, alert_id) -> None:
    await cap_service.submit_alert(
        session=db, current_user=user, alert_id=alert_id, payload=CapAlertAction()
    )
    await cap_service.approve_alert(
        session=db,
        current_user=await make_user(db, superuser=True),
        alert_id=alert_id,
        payload=CapAlertAction(),
    )


async def test_sent_is_the_publish_time_not_the_drafting_time(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _policy(db_async)
    user = await make_user(db_async, superuser=True)
    # The payload's own sent (an old time) is not kept: publish stamps the real one.
    _at(monkeypatch, DRAFTED)
    alert = await cap_service.create_alert(
        session=db_async,
        current_user=user,
        payload=CapAlertCreate(
            **{**_VALID_PAYLOAD_DICT, "sent": "2020-01-01T00:00:00+00:00"}
        ),
    )
    await _approve(db_async, user, alert.id)

    _at(monkeypatch, PUBLISHED)
    published, snapshot = await cap_service.publish_alert(
        session=db_async,
        current_user=user,
        alert_id=alert.id,
        payload=CapPublishAction(),
    )

    assert published.sent == PUBLISHED
    stored = await db_async.get(CapAlert, alert.id)
    assert stored is not None and stored.sent == PUBLISHED
    # The XML snapshot carries the publish time, not the drafting time.
    xml = await _snapshot_xml(db_async, snapshot.id)
    assert f"<sent>{_format_cap_datetime(PUBLISHED)}</sent>" in xml
    assert _format_cap_datetime(DRAFTED) not in xml


async def test_an_update_gets_its_own_publish_time_and_references_the_published_one(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _policy(db_async)
    user = await make_user(db_async, superuser=True)
    _at(monkeypatch, DRAFTED)
    first = await cap_service.create_alert(
        session=db_async,
        current_user=user,
        payload=CapAlertCreate(**_VALID_PAYLOAD_DICT),
    )
    await _approve(db_async, user, first.id)
    _at(monkeypatch, PUBLISHED)
    first_published, _ = await cap_service.publish_alert(
        session=db_async,
        current_user=user,
        alert_id=first.id,
        payload=CapPublishAction(),
    )

    _at(monkeypatch, DRAFTED + timedelta(hours=1))
    update = await cap_service.create_alert(
        session=db_async,
        current_user=user,
        payload=CapAlertCreate(
            **{
                **_VALID_PAYLOAD_DICT,
                "msg_type": "Update",
                "references": [
                    CapReferenceCreate(
                        sender=first_published.sender,
                        identifier=first_published.identifier,
                        sent=first_published.sent.replace(tzinfo=UTC),
                    ).model_dump(mode="json")
                ],
            }
        ),
    )
    await _approve(db_async, user, update.id)
    _at(monkeypatch, UPDATED)
    published, snapshot = await cap_service.publish_alert(
        session=db_async,
        current_user=user,
        alert_id=update.id,
        payload=CapPublishAction(),
    )

    assert published.sent == UPDATED
    assert (
        published.references[0].sent == PUBLISHED
    )  # the earlier message as it went out
    xml = await _snapshot_xml(db_async, snapshot.id)
    assert f"<sent>{_format_cap_datetime(UPDATED)}</sent>" in xml
    assert (
        _format_cap_datetime(PUBLISHED) in xml
    )  # the reference to the earlier message


async def test_a_cancellation_is_stamped_when_it_goes_out(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _policy(db_async)
    user = await make_user(db_async, superuser=True)
    _at(monkeypatch, DRAFTED)
    alert = await cap_service.create_alert(
        session=db_async,
        current_user=user,
        payload=CapAlertCreate(**_VALID_PAYLOAD_DICT),
    )
    await _approve(db_async, user, alert.id)
    _at(monkeypatch, PUBLISHED)
    await cap_service.publish_alert(
        session=db_async,
        current_user=user,
        alert_id=alert.id,
        payload=CapPublishAction(),
    )

    _at(monkeypatch, UPDATED)
    await cap_service.cancel_alert(
        session=db_async,
        current_user=user,
        alert_id=alert.id,
        payload=CapAlertAction(note="Event has passed"),
    )

    cancellation = (
        (await db_async.execute(select(CapAlert).where(CapAlert.msg_type == "Cancel")))
        .scalars()
        .all()[-1]
    )
    assert cancellation.sent == UPDATED
    snapshot = (
        (
            await db_async.execute(
                select(CapSnapshot).where(
                    CapSnapshot.identifier == cancellation.identifier
                )
            )
        )
        .scalars()
        .first()
    )
    assert snapshot is not None
    assert f"<sent>{_format_cap_datetime(UPDATED)}</sent>" in snapshot.xml


async def test_the_sent_time_reaches_the_public_feed(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _policy(db_async)
    user = await make_user(db_async, superuser=True)
    _at(monkeypatch, DRAFTED)
    alert = await cap_service.create_alert(
        session=db_async,
        current_user=user,
        payload=CapAlertCreate(**_VALID_PAYLOAD_DICT),
    )
    await _approve(db_async, user, alert.id)
    _at(monkeypatch, PUBLISHED)
    published, _ = await cap_service.publish_alert(
        session=db_async,
        current_user=user,
        alert_id=alert.id,
        payload=CapPublishAction(),
    )

    resp = await async_client.get(f"/api/cap/alerts/{published.identifier}")

    assert resp.status_code == 200, resp.text
    assert resp.json()["sent"].startswith("2026-10-31T10:15:00")


# ── WMO OID ─────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "value", ["2.49.0.1.308.1", "2.49.0.1.308.0042", " 2.49.0.1.308.1 "]
)
def test_a_wmo_oid_of_the_right_form_is_accepted(value: str) -> None:
    assert CapSettingsUpdate(wmo_oid=value).wmo_oid == value.strip()


@pytest.mark.parametrize(
    "value",
    [
        "2.49.0.1.308",
        "1.2.3.4.5.6",
        "2.49.0.1.308.1.9",
        "2.49.0.1.GD.1",
        "2.49.0.1.308.1x",
        "urn:oid:2.49.0.1.308.1",
        "2.49.0.1..1",
    ],
)
def test_a_wmo_oid_of_any_other_form_is_refused(value: str) -> None:
    with pytest.raises(ValidationError, match="WMO OID"):
        CapSettingsUpdate(wmo_oid=value)


def test_an_empty_oid_clears_it() -> None:
    assert CapSettingsUpdate(wmo_oid="").wmo_oid is None
    assert CapSettingsUpdate(wmo_oid=None).wmo_oid is None


async def test_the_settings_route_refuses_a_bad_oid_with_422(
    async_client: httpx.AsyncClient, superuser_token_headers_async: dict[str, str]
) -> None:
    resp = await async_client.patch(
        "/api/v1/cap/settings",
        headers=superuser_token_headers_async,
        json={"wmo_oid": "not-an-oid"},
    )
    assert resp.status_code == 422, resp.text
    assert "WMO OID" in resp.text

    ok = await async_client.patch(
        "/api/v1/cap/settings",
        headers=superuser_token_headers_async,
        json={"wmo_oid": "2.49.0.1.308.1"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["wmo_oid"] == "2.49.0.1.308.1"


# ── Pinned connection ───────────────────────────────────────────────────────


async def test_the_host_check_returns_the_address_it_checked() -> None:
    from src.cap.validation import ensure_public_host

    assert await ensure_public_host("93.184.216.34") == "93.184.216.34"
