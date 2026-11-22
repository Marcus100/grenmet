# ruff: noqa: ARG001  (pytest fixtures requested for their side effects)
"""WiPay safety rules (review of PR 1668): platform money, the live gate, the
production sandbox, the test checkout, replays, the live return, webhook limits."""

import json
import uuid

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.payments.exceptions import ProviderUnavailableError
from src.payments.models import LedgerEntry, LedgerKind, MerchantAccount
from src.payments.providers import wipay
from src.utils import secret_box
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import headers_for
from tests.payments import wipay_support
from tests.payments.test_wipay import _charges, _checkout, _intent_row, _org_with_wipay
from tests.payments.wipay_support import (
    WIPAY_WEBHOOK_SECRET,
    expected_hash,
    payment_webhook,
    return_query,
    signed_webhook,
)

API = "/api/v1/payments"
ADMIN = f"{API}/admin/merchant-accounts"
org_secret_keys = wipay_support.org_secret_keys
stripe_return_fallbacks = wipay_support.stripe_return_fallbacks
wipay_env = wipay_support.wipay_env


async def _row(db: AsyncSession, org_id: str) -> MerchantAccount:
    row = await db.scalar(
        select(MerchantAccount)
        .where(MerchantAccount.organisation_id == org_id)
        .execution_options(populate_existing=True)
    )
    assert row is not None
    return row


async def _prove_sandbox(
    db: AsyncSession, client: httpx.AsyncClient, org, admin, headers
) -> str:
    """A sandbox payment whose verified return records the sandbox proof."""
    intent_id, _ = await _checkout(db, client, org, admin, headers)
    row = await _intent_row(db, intent_id)
    await client.get(
        f"{API}/public/returns/wipay",
        params=return_query(
            order_id=row.id.hex,
            transaction_id=row.provider_ref or "",
            amount_minor=5000,
        ),
        follow_redirects=False,
    )
    return intent_id


async def _superuser(db: AsyncSession) -> dict[str, str]:
    return headers_for(await make_user(db, superuser=True))


# --- A: WiPay money is not Barrels' money ----------------------------------------------


async def test_a_wipay_payment_is_not_platform_money(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    intent_id = await _prove_sandbox(db_async, async_client, org, admin, headers)
    assert (
        await _charges(db_async, intent_id) == 1
    )  # the business's own sale is recorded

    balance = await async_client.get(f"{API}/org/balance", headers=headers)
    assert balance.status_code == 200
    assert balance.json()["data"] == []  # Barrels holds nothing for it

    payout = await async_client.post(
        f"{API}/admin/payouts",
        headers=await _superuser(db_async),
        json={
            "organisation_id": org.id,  # type: ignore[attr-defined]
            "amount_minor": 1000,
            "currency": "XCD",
            "reference": "test",
            "request_id": str(uuid.uuid4()),
        },
    )
    assert payout.status_code == 409, payout.text  # the balance is zero: refused


async def test_an_org_admin_cannot_create_a_wipay_intent_directly(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    response = await async_client.post(
        f"{API}/org/intents",
        headers=headers,
        json={
            "amount_minor": 5000,
            "provider": "wipay",
            "source_type": "shop.sale",
            "idempotency_key": uuid.uuid4().hex,
        },
    )
    assert response.status_code == 422
    assert wipay_env.requests == []


# --- B: a changed environment or secret starts the approval again ----------------------


async def test_a_new_environment_or_secret_resets_the_proof_and_the_approval(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    superuser = await _superuser(db_async)
    await _prove_sandbox(db_async, async_client, org, admin, headers)
    approved = await async_client.post(
        f"{ADMIN}/{org.id}/wipay/live-approval",  # type: ignore[attr-defined]
        headers=superuser,
        json={"approved": True},
    )
    assert approved.status_code == 200, approved.text

    # sandbox -> live: the approval and the proof are cleared.
    live = await async_client.put(
        f"{API}/org/merchant-accounts/wipay",
        headers=headers,
        json={"environment": "live", "enabled": True},
    )
    assert live.status_code == 200, live.text
    row = await _row(db_async, org.id)  # type: ignore[attr-defined]
    assert row.live_approved_at is None and row.sandbox_verified_at is None

    # live -> sandbox -> live again needs a new approval: the proof is gone too.
    back = await async_client.put(
        f"{API}/org/merchant-accounts/wipay",
        headers=headers,
        json={"environment": "sandbox", "enabled": True},
    )
    assert back.status_code == 200, back.text
    await _prove_sandbox(db_async, async_client, org, admin, headers)
    again = await async_client.post(
        f"{ADMIN}/{org.id}/wipay/live-approval",  # type: ignore[attr-defined]
        headers=superuser,
        json={"approved": True},
    )
    assert again.status_code == 200
    # A changed webhook secret alone also starts again.
    await async_client.put(
        f"{API}/org/merchant-accounts/wipay",
        headers=headers,
        json={
            "environment": "sandbox",
            "enabled": True,
            "webhook_secret": "a-new-webhook-secret-42",
        },
    )
    row = await _row(db_async, org.id)  # type: ignore[attr-defined]
    assert row.live_approved_at is None and row.sandbox_verified_at is None


# --- C: webhook limits -----------------------------------------------------------------


async def test_an_oversized_webhook_body_is_refused(
    async_client: httpx.AsyncClient, wipay_env
) -> None:
    body = b"{" + b'"x":"' + b"a" * (70 * 1024) + b'"}'
    _, headers = signed_webhook({"id": "big", "event": "payment.success"})
    response = await async_client.post(
        f"{API}/public/webhooks/wipay", content=body, headers=headers
    )
    assert response.status_code == 400


async def test_a_credential_blob_without_its_api_key_is_a_503_not_a_crash(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    wipay_env,
    org_secret_keys: list[str],
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    intent_id, _ = await _checkout(db_async, async_client, org, admin, headers)
    row = await _intent_row(db_async, intent_id)
    account = await _row(db_async, org.id)  # type: ignore[attr-defined]
    account.credentials_encrypted = secret_box.encrypt(
        json.dumps({"account_number": "1234567890"}), org_secret_keys
    )
    await db_async.commit()
    envelope = payment_webhook(
        "payment.success",
        order_id=row.id.hex,
        transaction_id=row.provider_ref or "",
        amount_minor=5000,
    )
    body, headers_out = signed_webhook(envelope)
    response = await async_client.post(
        f"{API}/public/webhooks/wipay", content=body, headers=headers_out
    )
    assert response.status_code == 503


# --- the production gate and the test checkout -----------------------------------------


async def test_in_production_the_sandbox_takes_no_customer_payment(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    wipay_env,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    assert not await wipay.is_ready(db_async, org.id)  # type: ignore[attr-defined]
    with pytest.raises(ProviderUnavailableError):
        await wipay.load_provider(db_async, organisation_id=org.id)  # type: ignore[attr-defined]
    # The business's own test checkout is the exception.
    provider = await wipay.load_provider(
        db_async,
        organisation_id=org.id,  # type: ignore[attr-defined]
        allow_sandbox_test=True,
    )
    assert provider.environment == "sandbox"


async def test_outside_production_the_sandbox_is_ready(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    wipay_env,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    monkeypatch.setattr(settings, "ENVIRONMENT", "staging")
    assert await wipay.is_ready(db_async, org.id)  # type: ignore[attr-defined]


async def test_in_production_the_test_checkout_proves_the_sandbox(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    wipay_env,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    response = await async_client.post(
        f"{API}/org/merchant-accounts/wipay/test-checkout", headers=headers
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["checkout_url"].startswith("https://gdsb.wipayfinancial.com/")
    intent_id = body["intent"]["id"]
    row = await _intent_row(db_async, intent_id)
    assert row.source_type == "payments.wipay-test"
    assert row.provider_environment == "sandbox"
    assert row.amount_minor == 100

    await async_client.get(
        f"{API}/public/returns/wipay",
        params=return_query(
            order_id=row.id.hex, transaction_id=row.provider_ref or "", amount_minor=100
        ),
        follow_redirects=False,
    )
    account = await _row(db_async, org.id)  # type: ignore[attr-defined]
    assert account.sandbox_verified_at is not None


async def test_the_test_checkout_needs_a_sandbox_account(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(
        db_async, async_client, environment="live"
    )
    response = await async_client.post(
        f"{API}/org/merchant-accounts/wipay/test-checkout", headers=headers
    )
    assert response.status_code == 409
    assert wipay_env.requests == []


# --- a replay returns the original, even after the rail is switched off ----------------


async def test_a_replay_after_the_rail_is_disabled_returns_the_original(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    from src.payments import schemas as payment_schemas
    from src.payments import service as payments_service
    from src.payments.models import ProviderKey

    org, admin, headers = await _org_with_wipay(db_async, async_client)
    payload = payment_schemas.PaymentIntentCreate(
        amount_minor=5000,
        provider=ProviderKey.WIPAY,
        source_type="shop.sale",
        source_id="sale-9",
        idempotency_key=uuid.uuid4().hex,
    )
    first = await payments_service.create_intent(
        db_async,
        organisation_id=org.id,
        actor=None,
        payload=payload,  # type: ignore[attr-defined]
    )
    await db_async.commit()
    await async_client.put(
        f"{API}/org/merchant-accounts/wipay",
        headers=headers,
        json={"environment": "sandbox", "enabled": False},
    )
    sent = len(wipay_env.requests)
    again = await payments_service.create_intent(
        db_async,
        organisation_id=org.id,
        actor=None,
        payload=payload,  # type: ignore[attr-defined]
    )
    assert again.intent.id == first.intent.id
    assert len(wipay_env.requests) == sent  # no new checkout was started


# --- the browser return is not trusted to credit live payments -------------------------


async def _approve_live(db: AsyncSession, org_id: str) -> None:
    account = await _row(db, org_id)
    account.live_approved_at = utc_now()
    await db.commit()


async def test_a_live_return_with_a_flipped_status_credits_nothing(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    wipay_env,
    stripe_return_fallbacks: None,
) -> None:
    org, admin, headers = await _org_with_wipay(
        db_async, async_client, environment="live"
    )
    await _approve_live(db_async, org.id)  # type: ignore[attr-defined]
    intent_id, _ = await _checkout(db_async, async_client, org, admin, headers)
    row = await _intent_row(db_async, intent_id)
    assert row.provider_environment == "live"
    tid = row.provider_ref or ""
    # A failed result whose status is flipped to success, with a hash for success.
    params = return_query(
        order_id=row.id.hex, transaction_id=tid, amount_minor=5000, status="failed"
    )
    params["status"] = "success"
    params["hash"] = expected_hash(tid, 5000)
    response = await async_client.get(
        f"{API}/public/returns/wipay", params=params, follow_redirects=False
    )
    assert response.status_code == 303
    assert await _charges(db_async, intent_id) == 0
    assert (await _intent_row(db_async, intent_id)).status == "processing"


async def test_a_verified_live_return_waits_for_the_signed_webhook(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    wipay_env,
    stripe_return_fallbacks: None,
) -> None:
    org, admin, headers = await _org_with_wipay(
        db_async, async_client, environment="live"
    )
    await _approve_live(db_async, org.id)  # type: ignore[attr-defined]
    intent_id, _ = await _checkout(db_async, async_client, org, admin, headers)
    row = await _intent_row(db_async, intent_id)
    tid = row.provider_ref or ""
    response = await async_client.get(
        f"{API}/public/returns/wipay",
        params=return_query(order_id=row.id.hex, transaction_id=tid, amount_minor=5000),
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert await _charges(db_async, intent_id) == 0  # the browser does not credit live
    body, headers_out = signed_webhook(
        payment_webhook(
            "payment.success",
            order_id=row.id.hex,
            transaction_id=tid,
            amount_minor=5000,
        ),
        secret=WIPAY_WEBHOOK_SECRET,
    )
    hook = await async_client.post(
        f"{API}/public/webhooks/wipay", content=body, headers=headers_out
    )
    assert hook.status_code == 200
    assert await _charges(db_async, intent_id) == 1


async def test_the_platform_ledger_count_ignores_wipay_in_the_reconciliation(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    intent_id = await _prove_sandbox(db_async, async_client, org, admin, headers)
    total = await db_async.scalar(
        select(func.count())
        .select_from(LedgerEntry)
        .where(
            LedgerEntry.intent_id == uuid.UUID(intent_id),
            LedgerEntry.kind == LedgerKind.CHARGE.value,
        )
    )
    assert total == 1  # recorded for the business's own totals, not as platform money


# --- review round 3: the redirect never rolls back a verified capture ------------------


async def test_the_test_checkout_returns_to_the_studio_settings_page(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    wipay_env,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No Stripe fallback URLs are set: the builder for the test checkout is the return."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    created = await async_client.post(
        f"{API}/org/merchant-accounts/wipay/test-checkout", headers=headers
    )
    assert created.status_code == 201, created.text
    row = await _intent_row(db_async, created.json()["intent"]["id"])
    assert row.source_id == org.slug  # type: ignore[attr-defined]
    response = await async_client.get(
        f"{API}/public/returns/wipay",
        params=return_query(
            order_id=row.id.hex, transaction_id=row.provider_ref or "", amount_minor=100
        ),
        follow_redirects=False,
    )
    assert response.status_code == 303, response.text
    location = response.headers["location"]
    assert f"/studio/{org.slug}/settings?wipay_test=paid" in location  # type: ignore[attr-defined]
    account = await _row(db_async, org.id)  # type: ignore[attr-defined]
    assert account.sandbox_verified_at is not None


async def test_a_failed_redirect_keeps_the_verified_capture(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    wipay_env,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.payments import return_urls

    org, admin, headers = await _org_with_wipay(db_async, async_client)
    intent_id, _ = await _checkout(db_async, async_client, org, admin, headers)
    row = await _intent_row(db_async, intent_id)
    monkeypatch.setattr(return_urls, "resolve", lambda *args, **kwargs: None)
    response = await async_client.get(
        f"{API}/public/returns/wipay",
        params=return_query(
            order_id=row.id.hex,
            transaction_id=row.provider_ref or "",
            amount_minor=5000,
        ),
        follow_redirects=False,
    )
    assert response.status_code == 503  # the customer gets an error page...
    assert await _charges(db_async, intent_id) == 1  # ...but the capture is committed
    assert (await _intent_row(db_async, intent_id)).status == "succeeded"
    account = await _row(db_async, org.id)  # type: ignore[attr-defined]
    assert account.sandbox_verified_at is not None


async def test_a_sandbox_proof_needs_a_sandbox_account(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    """A sandbox payment whose account has since gone live proves nothing about live."""
    from src.payments.providers import wipay as wipay_module

    org, admin, headers = await _org_with_wipay(db_async, async_client)
    intent_id, _ = await _checkout(db_async, async_client, org, admin, headers)
    row = await _intent_row(db_async, intent_id)
    account = await _row(db_async, org.id)  # type: ignore[attr-defined]
    account.environment = "live"
    await db_async.flush()
    await wipay_module.note_capture(db_async, row)
    assert account.sandbox_verified_at is None
