"""Admin moderation queue for organiser verification: roles, MFA, decisions, audit,
notifications, resubmission and isolation."""

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import service, totp
from src.auth.config import auth_settings
from src.auth.models import User
from src.events.models import Activity
from src.notifications.models import Notification
from src.organisations.models import PlatformOrganisation
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.events.support import (
    BASE,
    SessionFactory,
    client_with_real_roles,
    drain_notifications,
    queued,
)
from tests.factories import make_user
from tests.organisations.support import headers_for

ADMIN = "/api/v1/admin/moderation/organisers"


@pytest.fixture(autouse=True)
def _totp_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )


async def _mfa_superuser(db: AsyncSession) -> tuple[User, dict[str, str]]:
    admin = await make_user(db, superuser=True)
    admin.totp_secret = totp.encrypt_secret(totp.generate_secret())
    admin.totp_enabled = True
    await db.commit()
    stored, _ = await service.create_session(
        session=db,
        user=admin,
        app_name=None,
        enforce_approval=False,
        mfa_verified_at=utc_now(),
    )
    token, _ = service.issue_access_token_for_user(user=admin, db_session=stored)
    return admin, {"Authorization": f"Bearer {token}"}


async def _request_organiser(db: AsyncSession, name: str) -> tuple[User, dict]:
    """A member requests an organiser account (pending); returns owner and body."""
    owner = await user_with_role(db, None)
    async with client_with_real_roles(owner) as client:
        response = await client.post(f"{BASE}/manage/organiser", json={"name": name})
    assert response.status_code == 201, response.text
    return owner, response.json()


async def _status(db: AsyncSession, organisation_id: str) -> PlatformOrganisation:
    organisation = await db.get(
        PlatformOrganisation, organisation_id, populate_existing=True
    )
    assert organisation is not None
    return organisation


async def test_only_staff_with_the_right_role_reach_the_queue(
    async_client: httpx.AsyncClient, events_db: SessionFactory, db_async: AsyncSession
) -> None:
    _ = events_db
    _, created = await _request_organiser(db_async, "Gate Crew")
    org_id = created["organisation_id"]
    member = await user_with_role(db_async, None)
    calls = [
        ("GET", ADMIN, None),
        ("GET", f"{ADMIN}/{org_id}", None),
        ("POST", f"{ADMIN}/{org_id}/approve", {"reason": "Looks fine"}),
        ("POST", f"{ADMIN}/{org_id}/reject", {"reason": "Not fine"}),
    ]
    for method, url, body in calls:
        anonymous = await async_client.request(method, url, json=body)
        assert anonymous.status_code == 401, (method, url)
        plain = await async_client.request(
            method, url, json=body, headers=headers_for(member)
        )
        assert plain.status_code == 403, (method, url, plain.text)


async def test_moderator_reads_but_cannot_decide(
    async_client: httpx.AsyncClient, events_db: SessionFactory, db_async: AsyncSession
) -> None:
    _ = events_db
    _, created = await _request_organiser(db_async, "Read Only Crew")
    org_id = created["organisation_id"]
    moderator = await user_with_role(db_async, "events-moderator")
    headers = headers_for(moderator)

    listing = await async_client.get(ADMIN, headers=headers)
    assert listing.status_code == 200
    assert [row["organisation_id"] for row in listing.json()["data"]] == [org_id]
    case = await async_client.get(f"{ADMIN}/{org_id}", headers=headers)
    assert case.status_code == 200
    assert case.json()["verification_status"] == "pending"
    assert case.json()["owners"][0]["role"] == "owner"

    for action, reason in (("approve", "Fine"), ("reject", "Not fine")):
        response = await async_client.post(
            f"{ADMIN}/{org_id}/{action}", headers=headers, json={"reason": reason}
        )
        assert response.status_code == 403, response.text
    assert (await _status(db_async, org_id)).verification_status == "pending"


async def test_superuser_without_mfa_is_refused_but_may_read(
    async_client: httpx.AsyncClient, events_db: SessionFactory, db_async: AsyncSession
) -> None:
    _ = events_db
    _, created = await _request_organiser(db_async, "No Mfa Crew")
    org_id = created["organisation_id"]
    plain_superuser = await make_user(db_async, superuser=True)
    headers = headers_for(plain_superuser)
    assert (await async_client.get(ADMIN, headers=headers)).status_code == 200
    for action in ("approve", "reject"):
        response = await async_client.post(
            f"{ADMIN}/{org_id}/{action}", headers=headers, json={"reason": "Testing"}
        )
        assert response.status_code == 403
        assert "superuser_mfa_required" in response.json()["detail"]
    assert (await _status(db_async, org_id)).verification_status == "pending"


async def test_approve_audits_the_actor_notifies_once_and_rejects_repeats(
    async_client: httpx.AsyncClient, events_db: SessionFactory, db_async: AsyncSession
) -> None:
    owner, created = await _request_organiser(db_async, "Approved Crew")
    owner_id = owner.id
    org_id = created["organisation_id"]
    admin, headers = await _mfa_superuser(db_async)
    admin_id = admin.id

    response = await async_client.post(
        f"{ADMIN}/{org_id}/approve", headers=headers, json={"reason": "Papers seen"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["verification_status"] == "approved"
    assert body["verification_reason"] == "Papers seen"
    assert [(e["action"], e["reason"]) for e in body["history"]] == [
        ("verify", "Papers seen")
    ]

    organisation = await _status(db_async, org_id)
    assert organisation.verified_at is not None
    audit = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.entity_id == org_id, AuditEntry.action == "verify"
            )
        )
    ).all()
    assert [entry.actor_user_id for entry in audit] == [admin_id]
    async with events_db() as db:
        actions = (await db.scalars(select(Activity.action))).all()
        assert "organiser.verified" in actions
    # The public organiser now reads as verified and may publish.
    async with client_with_real_roles(owner) as client:
        mine = await client.get(f"{BASE}/organisers/{created['slug']}")
        assert mine.json()["verified"] is True

    repeat = await async_client.post(
        f"{ADMIN}/{org_id}/approve", headers=headers, json={"reason": "Again"}
    )
    assert repeat.status_code == 409
    assert [row.payload["kind"] for row in await queued(events_db)] == [
        "organiser.approved"
    ]
    assert await drain_notifications(events_db) == 1
    rows = (
        await db_async.scalars(
            select(Notification).where(
                Notification.event_key == "events.organiser_approved"
            )
        )
    ).all()
    assert [row.recipient_user_id for row in rows] == [owner_id]
    pending = await async_client.get(ADMIN, headers=headers)
    assert pending.json()["data"] == []
    approved = await async_client.get(f"{ADMIN}?status=approved", headers=headers)
    assert [row["organisation_id"] for row in approved.json()["data"]] == [org_id]


async def test_reject_needs_a_reason_notifies_with_it_and_rejects_repeats(
    async_client: httpx.AsyncClient, events_db: SessionFactory, db_async: AsyncSession
) -> None:
    owner, created = await _request_organiser(db_async, "Rejected Crew")
    owner_id = owner.id
    org_id = created["organisation_id"]
    admin, headers = await _mfa_superuser(db_async)
    admin_id = admin.id
    url = f"{ADMIN}/{org_id}/reject"

    assert (await async_client.post(url, headers=headers, json={})).status_code == 422
    assert (
        await async_client.post(url, headers=headers, json={"reason": "  "})
    ).status_code == 422
    assert (await _status(db_async, org_id)).verification_status == "pending"

    response = await async_client.post(
        url, headers=headers, json={"reason": "No registration number"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["verification_status"] == "rejected"
    organisation = await _status(db_async, org_id)
    assert organisation.verified_at is None
    assert organisation.verification_reason == "No registration number"
    audit = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.entity_id == org_id, AuditEntry.action == "reject"
            )
        )
    ).all()
    assert [entry.actor_user_id for entry in audit] == [admin_id]
    assert (
        await async_client.post(url, headers=headers, json={"reason": "Twice"})
    ).status_code == 409
    # Out of the pending queue, listed under rejected.
    assert (await async_client.get(ADMIN, headers=headers)).json()["data"] == []
    rejected = await async_client.get(f"{ADMIN}?status=rejected", headers=headers)
    assert [row["organisation_id"] for row in rejected.json()["data"]] == [org_id]

    assert [row.payload["kind"] for row in await queued(events_db)] == [
        "organiser.rejected"
    ]
    assert await drain_notifications(events_db) == 1
    rows = (
        await db_async.scalars(
            select(Notification).where(
                Notification.event_key == "events.organiser_rejected"
            )
        )
    ).all()
    assert [row.recipient_user_id for row in rows] == [owner_id]
    assert "No registration number" in rows[0].body
    # Still unverified: publishing stays blocked.
    async with client_with_real_roles(owner) as client:
        assert (await client.get(f"{BASE}/organisers/{created['slug']}")).json()[
            "verified"
        ] is False
        again = await client.post(
            f"{BASE}/manage/organiser", json={"name": "Another Crew"}
        )
        assert again.status_code == 409
        assert "resubmit" in again.json()["detail"]


async def test_rejected_organiser_resubmits_and_is_reviewed_again(
    async_client: httpx.AsyncClient, events_db: SessionFactory, db_async: AsyncSession
) -> None:
    _ = events_db
    owner, created = await _request_organiser(db_async, "Second Chance Crew")
    org_id = created["organisation_id"]
    stranger, _ = await _request_organiser(db_async, "Bystander Crew")
    _, headers = await _mfa_superuser(db_async)
    resubmit = f"{BASE}/manage/organiser/resubmit"

    # Not rejected yet.
    async with client_with_real_roles(owner) as client:
        assert (await client.post(resubmit)).status_code == 409
    await async_client.post(
        f"{ADMIN}/{org_id}/reject", headers=headers, json={"reason": "Missing bio"}
    )
    # Someone else's owner cannot resubmit this organiser; theirs is pending (409).
    async with client_with_real_roles(stranger) as client:
        assert (await client.post(resubmit)).status_code == 409
    assert (await _status(db_async, org_id)).verification_status == "rejected"

    async with client_with_real_roles(owner) as client:
        resubmitted = await client.post(resubmit)
        assert resubmitted.status_code == 200, resubmitted.text
        assert (await client.post(resubmit)).status_code == 409
    assert (await _status(db_async, org_id)).verification_status == "pending"
    pending = await async_client.get(ADMIN, headers=headers)
    assert {row["organisation_id"] for row in pending.json()["data"]} >= {org_id}
    case = (await async_client.get(f"{ADMIN}/{org_id}", headers=headers)).json()
    assert [e["action"] for e in case["history"]] == ["resubmit", "reject"]

    approved = await async_client.post(
        f"{ADMIN}/{org_id}/approve", headers=headers, json={"reason": "Fixed"}
    )
    assert approved.status_code == 200
    assert approved.json()["verification_status"] == "approved"


async def test_cases_are_isolated_and_unknown_ones_404(
    async_client: httpx.AsyncClient, events_db: SessionFactory, db_async: AsyncSession
) -> None:
    _ = events_db
    _, first = await _request_organiser(db_async, "First Crew")
    _, second = await _request_organiser(db_async, "Second Crew")
    _, headers = await _mfa_superuser(db_async)
    await async_client.post(
        f"{ADMIN}/{first['organisation_id']}/reject",
        headers=headers,
        json={"reason": "Incomplete"},
    )
    other = (
        await async_client.get(f"{ADMIN}/{second['organisation_id']}", headers=headers)
    ).json()
    assert other["verification_status"] == "pending"
    assert other["verification_reason"] is None
    assert other["history"] == []
    assert other["name"] == "Second Crew"

    assert (
        await async_client.get(f"{ADMIN}/org_missing", headers=headers)
    ).status_code == 404
    bare = await make_user(db_async)
    from src.organisations import service as org_service
    from src.organisations.models import OrganisationKind

    plain = await org_service.create_organisation(
        db_async, name="No Organiser Co", kind=OrganisationKind.BUSINESS
    )
    await db_async.commit()
    _ = bare
    for method, suffix in (("GET", ""), ("POST", "/approve"), ("POST", "/reject")):
        response = await async_client.request(
            method,
            f"{ADMIN}/{plain.id}{suffix}",
            headers=headers,
            json={"reason": "Test"},
        )
        assert response.status_code == 404, (method, suffix)


async def test_legacy_moderator_patch_keeps_status_in_step(
    events_db: SessionFactory, db_async: AsyncSession
) -> None:
    _ = events_db
    _, created = await _request_organiser(db_async, "Legacy Path Crew")
    moderator = await user_with_role(db_async, "events-moderator")
    async with client_with_real_roles(moderator) as client:
        url = f"{BASE}/moderation/organisers/{created['id']}"
        assert (await client.patch(url, json={"verified": True})).status_code == 200
    organisation = await _status(db_async, created["organisation_id"])
    assert organisation.verification_status == "approved"
    assert organisation.verified_at is not None
