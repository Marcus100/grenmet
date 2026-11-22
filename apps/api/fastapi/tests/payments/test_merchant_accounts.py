# ruff: noqa: ARG001  (pytest fixtures requested for their side effects)
"""Per-business payment settings (ADR-0027 amendment): encrypted credentials, the
owner's live gate and the Grenada platform fee switch."""

import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations.models import MembershipRole
from src.payments import service as payments_service
from src.payments.config import PaymentsConfig
from src.payments.models import MerchantAccount
from src.utils import secret_box
from tests.factories import assign_role, make_role_with_permission, make_user
from tests.organisations.support import headers_for, make_org
from tests.payments import wipay_support
from tests.payments.test_wipay import _checkout, _intent_row, _org_with_wipay
from tests.payments.wipay_support import (
    WIPAY_ACCOUNT_NUMBER,
    WIPAY_API_KEY,
    WIPAY_WEBHOOK_SECRET,
    return_query,
)

# The fixtures live in wipay_support; bound here by name (as test_deposits does).
org_secret_keys = wipay_support.org_secret_keys
wipay_env = wipay_support.wipay_env

API = "/api/v1/payments"
ADMIN_PATH = f"{API}/admin/merchant-accounts"


def _put_body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "environment": "sandbox",
        "enabled": True,
        "account_number": WIPAY_ACCOUNT_NUMBER,
        "api_key": WIPAY_API_KEY,
        "webhook_secret": WIPAY_WEBHOOK_SECRET,
    }
    body.update(overrides)
    return body


async def _row(db: AsyncSession, org_id: str) -> MerchantAccount:
    row = await db.scalar(
        select(MerchantAccount)
        .where(MerchantAccount.organisation_id == org_id)
        .execution_options(populate_existing=True)
    )
    assert row is not None
    return row


async def test_credentials_are_stored_encrypted_and_never_returned(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    row = await _row(db_async, org.id)  # type: ignore[attr-defined]

    assert row.credentials_encrypted.startswith(secret_box.ENCRYPTED_PREFIX)
    for secret in (WIPAY_API_KEY, WIPAY_WEBHOOK_SECRET, WIPAY_ACCOUNT_NUMBER):
        assert secret not in row.credentials_encrypted

    listing = await async_client.get(f"{API}/org/merchant-accounts", headers=headers)
    assert listing.status_code == 200
    text = listing.text
    for secret in (WIPAY_API_KEY, WIPAY_WEBHOOK_SECRET, WIPAY_ACCOUNT_NUMBER):
        assert secret not in text
    item = listing.json()["data"][0]
    assert item["provider"] == "wipay"
    assert item["has_credentials"] is True
    assert item["has_webhook_secret"] is True
    assert item["sandbox_verified_at"] is None
    assert item["live_approved_at"] is None


async def test_the_stored_secrets_decrypt_with_the_organisation_keys(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    wipay_env,
    org_secret_keys: list[str],
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    row = await _row(db_async, org.id)  # type: ignore[attr-defined]
    plain = secret_box.decrypt(row.credentials_encrypted, org_secret_keys)
    assert WIPAY_API_KEY in plain
    assert WIPAY_WEBHOOK_SECRET in plain


async def test_a_later_save_without_a_secret_keeps_the_stored_one(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    wipay_env,
    org_secret_keys: list[str],
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    response = await async_client.put(
        f"{API}/org/merchant-accounts/wipay",
        headers=headers,
        json={"environment": "sandbox", "enabled": True},
    )
    assert response.status_code == 200, response.text
    row = await _row(db_async, org.id)  # type: ignore[attr-defined]
    plain = secret_box.decrypt(row.credentials_encrypted, org_secret_keys)
    assert WIPAY_API_KEY in plain
    assert WIPAY_WEBHOOK_SECRET in plain


async def test_saving_without_organisation_secret_keys_is_the_existing_503(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    wipay_env,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.organisations.config import organisations_settings

    monkeypatch.setattr(organisations_settings, "ORG_SECRET_ENCRYPTION_KEYS", [])
    admin = await make_user(db_async)
    org = await make_org(
        db_async,
        f"Salon {uuid.uuid4().hex[:6]}",
        members=((admin, MembershipRole.ADMIN),),
        apps=("payments",),
    )
    response = await async_client.put(
        f"{API}/org/merchant-accounts/wipay",
        headers=headers_for(admin, org.id),
        json=_put_body(),
    )
    assert response.status_code == 503
    assert "secret storage" in response.json()["detail"].lower()
    assert (
        await db_async.scalar(
            select(MerchantAccount.id).where(MerchantAccount.organisation_id == org.id)
        )
        is None
    )


async def test_a_new_account_needs_its_api_key(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    admin = await make_user(db_async)
    org = await make_org(
        db_async,
        f"Salon {uuid.uuid4().hex[:6]}",
        members=((admin, MembershipRole.ADMIN),),
        apps=("payments",),
    )
    response = await async_client.put(
        f"{API}/org/merchant-accounts/wipay",
        headers=headers_for(admin, org.id),
        json={"environment": "sandbox", "enabled": True},
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "overrides",
    [
        {"account_number": "12AB"},
        {"account_number": "1" * 13},
        {"api_key": "short"},
        {"api_key": "has space in it 12345"},
        {"environment": "production"},
        {"webhook_secret": "x"},
    ],
)
async def test_invalid_settings_are_refused(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    wipay_env,
    overrides: dict[str, object],
) -> None:
    admin = await make_user(db_async)
    org = await make_org(
        db_async,
        f"Salon {uuid.uuid4().hex[:6]}",
        members=((admin, MembershipRole.ADMIN),),
        apps=("payments",),
    )
    response = await async_client.put(
        f"{API}/org/merchant-accounts/wipay",
        headers=headers_for(admin, org.id),
        json=_put_body(**overrides),
    )
    assert response.status_code == 422


async def test_an_organisation_member_who_is_not_an_admin_cannot_save(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    owner = await make_user(db_async)
    clerk = await make_user(db_async)
    org = await make_org(
        db_async,
        f"Salon {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.ADMIN), (clerk, MembershipRole.MEMBER)),
        apps=("payments",),
    )
    response = await async_client.put(
        f"{API}/org/merchant-accounts/wipay",
        headers=headers_for(clerk, org.id),
        json=_put_body(),
    )
    assert response.status_code == 403


async def test_each_organisation_lists_only_its_own_accounts(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org_a, _, headers_a = await _org_with_wipay(db_async, async_client)
    org_b, admin_b, headers_b = await _org_with_wipay(
        db_async, async_client, enabled=False
    )
    listing = await async_client.get(f"{API}/org/merchant-accounts", headers=headers_b)
    rows = listing.json()["data"]
    assert len(rows) == 1
    assert rows[0]["enabled"] is False
    other = await async_client.get(f"{API}/org/merchant-accounts", headers=headers_a)
    assert other.json()["data"][0]["enabled"] is True


async def test_the_owner_approves_live_only_after_a_verified_sandbox_payment(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    wipay_env,
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    superuser = await make_user(db_async, superuser=True)
    superuser_headers = headers_for(superuser, None)

    too_early = await async_client.post(
        f"{ADMIN_PATH}/{org.id}/wipay/live-approval",  # type: ignore[attr-defined]
        headers=superuser_headers,
        json={"approved": True},
    )
    assert too_early.status_code == 409
    assert "sandbox" in too_early.json()["detail"].lower()

    intent_id, _ = await _checkout(db_async, async_client, org, admin, headers)
    row = await _intent_row(db_async, intent_id)
    await async_client.get(
        f"{API}/public/returns/wipay",
        params=return_query(
            order_id=row.id.hex,
            transaction_id=row.provider_ref or "",
            amount_minor=5000,
        ),
        follow_redirects=False,
    )

    approved = await async_client.post(
        f"{ADMIN_PATH}/{org.id}/wipay/live-approval",  # type: ignore[attr-defined]
        headers=superuser_headers,
        json={"approved": True},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["live_approved_at"] is not None

    revoked = await async_client.post(
        f"{ADMIN_PATH}/{org.id}/wipay/live-approval",  # type: ignore[attr-defined]
        headers=superuser_headers,
        json={"approved": False},
    )
    assert revoked.status_code == 200
    assert revoked.json()["live_approved_at"] is None


async def test_only_the_owner_can_approve_live(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    response = await async_client.post(
        f"{ADMIN_PATH}/{org.id}/wipay/live-approval",  # type: ignore[attr-defined]
        headers=headers,
        json={"approved": True},
    )
    assert response.status_code in (401, 403)


async def test_the_live_switch_needs_the_payments_live_approve_permission(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    intent_id, _ = await _checkout(db_async, async_client, org, admin, headers)
    row = await _intent_row(db_async, intent_id)
    await async_client.get(
        f"{API}/public/returns/wipay",
        params=return_query(
            order_id=row.id.hex,
            transaction_id=row.provider_ref or "",
            amount_minor=5000,
        ),
        follow_redirects=False,
    )

    # Not granted: refused, and the switch stays off.
    clerk = await make_user(db_async)
    refused = await async_client.post(
        f"{ADMIN_PATH}/{org.id}/wipay/live-approval",  # type: ignore[attr-defined]
        headers=headers_for(clerk),
        json={"approved": True},
    )
    assert refused.status_code == 403

    # Granted through a role: that user can switch live on.
    approver = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "payments.live.approve")
    await assign_role(db_async, user=approver, role=role)
    approved = await async_client.post(
        f"{ADMIN_PATH}/{org.id}/wipay/live-approval",  # type: ignore[attr-defined]
        headers=headers_for(approver),
        json={"approved": True},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["live_approved_at"] is not None


async def test_live_readiness_follows_the_owner_switch(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(
        db_async, async_client, environment="live"
    )
    assert not await payments_service.wipay_ready(db_async, org.id)  # type: ignore[attr-defined]
    row = await _row(db_async, org.id)  # type: ignore[attr-defined]
    row.sandbox_verified_at = row.updated_at
    row.live_approved_at = row.updated_at
    await db_async.flush()
    assert await payments_service.wipay_ready(db_async, org.id)  # type: ignore[attr-defined]
    row.enabled = False
    await db_async.flush()
    assert not await payments_service.wipay_ready(db_async, org.id)  # type: ignore[attr-defined]


def test_the_grenada_platform_fee_is_off_by_default_and_cannot_be_switched_on() -> None:
    assert PaymentsConfig().GRENADA_PLATFORM_FEE_ENABLED is False
    with pytest.raises(ValueError):
        PaymentsConfig(GRENADA_PLATFORM_FEE_ENABLED=True)


async def test_a_business_with_a_connect_account_is_not_wipay_ready(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    """Connect (New Zealand) keeps a connected business's card payments; WiPay is not
    used for it even when its own account is enabled and approved."""
    from src.payments.connect.models import ConnectedAccount

    org, admin, headers = await _org_with_wipay(db_async, async_client)
    assert await payments_service.wipay_ready(db_async, org.id)  # type: ignore[attr-defined]
    db_async.add(
        ConnectedAccount(
            organisation_id=org.id,  # type: ignore[attr-defined]
            stripe_account_id=f"acct_test_{uuid.uuid4().hex[:10]}",
            country="NZ",
        )
    )
    await db_async.flush()
    assert not await payments_service.wipay_ready(db_async, org.id)  # type: ignore[attr-defined]


async def test_a_first_save_that_loses_a_race_applies_to_the_row_that_won(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    wipay_env,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.payments import merchant_accounts

    org, admin, headers = await _org_with_wipay(db_async, async_client)
    real_row = merchant_accounts._row
    calls = {"count": 0}

    async def first_look_misses(session, organisation_id):  # type: ignore[no-untyped-def]
        calls["count"] += 1
        if calls["count"] == 1:
            return None  # another request has just inserted the row
        return await real_row(session, organisation_id)

    monkeypatch.setattr(merchant_accounts, "_row", first_look_misses)
    response = await async_client.put(
        f"{API}/org/merchant-accounts/wipay",
        headers=headers,
        json=_put_body(enabled=False),
    )
    assert response.status_code == 200, response.text
    assert response.json()["enabled"] is False
    rows = list(
        await db_async.scalars(
            select(MerchantAccount).where(MerchantAccount.organisation_id == org.id)  # type: ignore[attr-defined]
        )
    )
    assert len(rows) == 1
