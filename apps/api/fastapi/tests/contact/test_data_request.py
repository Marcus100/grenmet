"""GMS climate data requests: stored, mailed to the inbox, confirmed to the requester."""

import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contact.config import contact_settings
from src.contact.models import ContactDataRequest
from src.notifications.models import OutboundEmail

_URL = "/api/v1/contact/data-requests"


def _payload(**overrides: object) -> dict[str, object]:
    unique = uuid.uuid4().hex[:10]
    return {
        "name": "Dr Ada Researcher",
        "email": f"ada-{unique}@example.com",
        "organisation": f"Org {unique}",
        "purpose": "Flood risk study <b>for</b> the south coast.",
        "parameters": ["rainfall", "temperature"],
        "stations": "Maurice Bishop International Airport",
        "period_start": "2000-01-01",
        "period_end": "2020-12-31",
        "data_format": "csv",
        "intended_use": "academic",
        "consent": True,
        **overrides,
    }


async def _stored(db: AsyncSession, organisation: str) -> ContactDataRequest | None:
    db.expire_all()
    return await db.scalar(
        select(ContactDataRequest).where(
            ContactDataRequest.organisation == organisation
        )
    )


async def _mails(db: AsyncSession, to_email: str) -> list[OutboundEmail]:
    db.expire_all()
    return list(
        (
            await db.scalars(
                select(OutboundEmail).where(OutboundEmail.to_email == to_email)
            )
        ).all()
    )


async def test_request_is_stored_mailed_and_confirmed(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inbox = f"gms-{uuid.uuid4().hex[:8]}@example.com"
    monkeypatch.setattr(contact_settings, "GMS_DATA_REQUEST_RECIPIENT", inbox)
    payload = _payload()
    resp = await async_client.post(_URL, json=payload)
    assert resp.status_code == 202
    assert resp.json() == {"ok": True}

    stored = await _stored(db_async, str(payload["organisation"]))
    assert stored is not None
    assert stored.site == "gms-data-request"
    assert stored.parameters == ["rainfall", "temperature"]
    assert stored.data_format == "csv"
    assert stored.consent_at is not None

    [to_gms] = await _mails(db_async, inbox)
    assert to_gms.html is not None
    assert "<b>" not in to_gms.html
    assert "&lt;b&gt;" in to_gms.html
    [confirm] = await _mails(db_async, str(payload["email"]))
    assert confirm.transactional is True
    assert confirm.subject == "We received your climate data request"


async def test_without_recipient_only_confirmation_is_sent(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(contact_settings, "GMS_DATA_REQUEST_RECIPIENT", None)
    payload = _payload()
    resp = await async_client.post(_URL, json=payload)
    assert resp.status_code == 202
    assert await _stored(db_async, str(payload["organisation"])) is not None
    assert len(await _mails(db_async, str(payload["email"]))) == 1


async def test_honeypot_is_dropped_silently(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    payload = _payload(website="http://spam.example")
    resp = await async_client.post(_URL, json=payload)
    assert resp.status_code == 202
    assert await _stored(db_async, str(payload["organisation"])) is None
    assert await _mails(db_async, str(payload["email"])) == []


@pytest.mark.parametrize(
    "overrides",
    [
        {"consent": False},
        {"parameters": []},
        {"parameters": ["gold"]},
        {"period_start": "2021-01-01", "period_end": "2020-01-01"},
        {"data_format": "docx"},
        {"email": "not-an-email"},
        {"purpose": "short"},
    ],
)
async def test_invalid_requests_are_rejected(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    overrides: dict[str, object],
) -> None:
    payload = _payload(**overrides)
    resp = await async_client.post(_URL, json=payload)
    assert resp.status_code in {400, 422}
    assert await _stored(db_async, str(payload["organisation"])) is None
