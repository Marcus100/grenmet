"""Public contact messages: stored, rate-limited at the edge, mailed via the outbox."""

import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contact.config import contact_settings, recipient_for
from src.contact.models import ContactMessage
from src.notifications.models import OutboundEmail

_URL = "/api/v1/contact/messages"


def _payload(**overrides: object) -> dict[str, object]:
    unique = uuid.uuid4().hex[:10]
    return {
        "site": "mbia",
        "name": "Jane Reader",
        "email": f"jane-{unique}@example.com",
        "subject": f"Lost bag {unique}",
        "message": "I lost a bag <script>alert(1)</script> on the 12th.",
        **overrides,
    }


async def _stored(db: AsyncSession, subject: str) -> ContactMessage | None:
    db.expire_all()
    return await db.scalar(
        select(ContactMessage).where(ContactMessage.subject == subject)
    )


async def test_message_is_stored_and_one_email_queued(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(contact_settings, "MBIA_CONTACT_RECIPIENT", "Inbox@Example.com")
    payload = _payload(turnstile_token="token-not-checked-yet")
    resp = await async_client.post(_URL, json=payload)
    assert resp.status_code == 202
    assert resp.json() == {"ok": True}

    stored = await _stored(db_async, str(payload["subject"]))
    assert stored is not None
    assert stored.site == "mbia"
    assert stored.email == payload["email"]

    mails = list(
        (
            await db_async.scalars(
                select(OutboundEmail).where(
                    OutboundEmail.subject == f"Website message: {payload['subject']}"
                )
            )
        ).all()
    )
    assert len(mails) == 1
    assert mails[0].to_email == "inbox@example.com"
    assert mails[0].transactional is True
    assert mails[0].html is not None
    assert "<script>" not in mails[0].html  # visitor text is escaped
    assert "&lt;script&gt;" in mails[0].html


async def test_without_recipient_message_is_only_stored(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(contact_settings, "MBIA_CONTACT_RECIPIENT", None)
    payload = _payload()
    resp = await async_client.post(_URL, json=payload)
    assert resp.status_code == 202

    assert await _stored(db_async, str(payload["subject"])) is not None
    queued = await db_async.scalar(
        select(OutboundEmail).where(
            OutboundEmail.subject == f"Website message: {payload['subject']}"
        )
    )
    assert queued is None


async def test_site_defaults_to_mbia_and_routes_to_its_own_inbox(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(contact_settings, "MBIA_CONTACT_RECIPIENT", "mbia@example.com")
    monkeypatch.setattr(
        contact_settings, "BARRELS_CONTACT_RECIPIENT", "barrels@example.com"
    )
    payload = _payload()
    payload.pop("site")
    resp = await async_client.post(_URL, json=payload)
    assert resp.status_code == 202

    stored = await _stored(db_async, str(payload["subject"]))
    assert stored is not None
    assert stored.site == "mbia"
    mails = list(
        (
            await db_async.scalars(
                select(OutboundEmail).where(
                    OutboundEmail.subject == f"Website message: {payload['subject']}"
                )
            )
        ).all()
    )
    assert [mail.to_email for mail in mails] == ["mbia@example.com"]


async def test_barrels_message_goes_to_barrels_inbox_only(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(contact_settings, "MBIA_CONTACT_RECIPIENT", "mbia@example.com")
    monkeypatch.setattr(
        contact_settings, "BARRELS_CONTACT_RECIPIENT", "barrels@example.com"
    )
    payload = _payload(site="barrels")
    resp = await async_client.post(_URL, json=payload)
    assert resp.status_code == 202

    stored = await _stored(db_async, str(payload["subject"]))
    assert stored is not None
    assert stored.site == "barrels"
    mails = list(
        (
            await db_async.scalars(
                select(OutboundEmail).where(
                    OutboundEmail.subject == f"Website message: {payload['subject']}"
                )
            )
        ).all()
    )
    assert [mail.to_email for mail in mails] == ["barrels@example.com"]


def test_recipient_for_reads_each_site_setting(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(contact_settings, "MBIA_CONTACT_RECIPIENT", "mbia@example.com")
    monkeypatch.setattr(contact_settings, "BARRELS_CONTACT_RECIPIENT", None)
    assert recipient_for("mbia") == "mbia@example.com"
    assert recipient_for("barrels") is None


@pytest.mark.parametrize(
    "overrides",
    [
        {"email": "nope"},
        {"name": "x"},
        {"message": "short"},
        {"site": "other"},
        {"message": "x" * 4001},
    ],
)
async def test_invalid_payloads_are_rejected(
    async_client: httpx.AsyncClient, overrides: dict[str, object]
) -> None:
    resp = await async_client.post(_URL, json=_payload(**overrides))
    assert resp.status_code == 422


async def _site(db: AsyncSession, **settings: object) -> str:
    """A fresh public site owned by a new organisation; returns its key."""
    from src.organisations.models import PublicSite, new_public_site_id
    from tests.organisations.support import make_org

    org = await make_org(db, f"Contact Co {uuid.uuid4().hex[:6]}")
    key = f"contact-{uuid.uuid4().hex[:8]}"
    defaults: dict[str, object] = {
        "accepts_contact": True,
        "accepts_subscriptions": False,
        "turnstile_mode": "inherit",
    }
    db.add(
        PublicSite(
            id=new_public_site_id(),
            organisation_id=org.id,
            key=key,
            name="Contact Site",
            **{**defaults, **settings},
        )
    )
    await db.commit()
    return key


async def test_site_route_mails_the_site_inbox(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    key = await _site(db_async, contact_recipient="site-inbox@example.com")
    payload = _payload()
    del payload["site"]
    resp = await async_client.post(
        f"/api/v1/contact/public/{key}/messages", json=payload
    )
    assert resp.status_code == 202

    stored = await _stored(db_async, str(payload["subject"]))
    assert stored is not None and stored.site == key
    mails = (
        await db_async.scalars(
            select(OutboundEmail).where(
                OutboundEmail.subject == f"Website message: {payload['subject']}"
            )
        )
    ).all()
    assert [m.to_email for m in mails] == ["site-inbox@example.com"]


async def test_site_route_refuses_unknown_and_subscription_only_sites(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    payload = _payload()
    del payload["site"]
    unknown = await async_client.post(
        "/api/v1/contact/public/no-such-site/messages", json=payload
    )
    assert unknown.status_code == 404
    key = await _site(db_async, accepts_contact=False)
    refused = await async_client.post(
        f"/api/v1/contact/public/{key}/messages", json=payload
    )
    assert refused.status_code == 404


def test_environment_fallback_only_covers_the_pre_n1_sites(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(contact_settings, "MBIA_CONTACT_RECIPIENT", "mbia@example.com")
    assert recipient_for("mbia") == "mbia@example.com"
    assert recipient_for("some-new-site") is None
