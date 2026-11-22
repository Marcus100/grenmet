"""A business's own online-payment settings (ADR-0027 amendment, 21 Nov 2026).

- Credentials are one encrypted blob under the organisation keys
  (``ORG_SECRET_ENCRYPTION_KEYS``); with no keys saving is the existing 503.
- Responses never carry a secret. A blank secret on save keeps the stored one.
- Changing the environment, or any credential (account number, API key or webhook
  secret), starts again: no sandbox proof and no live approval carry over, so
  live -> sandbox -> live needs a new approval.
- The sandbox proof comes from a verified sandbox payment: the business's own sandbox
  checkout (``start_test_checkout``, the only way to test in production).
Service functions flush; routers commit.
"""

import json
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.organisations.config import organisations_settings
from src.organisations.exceptions import SecretStorageUnavailableError
from src.utils import secret_box
from src.utils.datetime import utc_now

from . import schemas, service
from .exceptions import PaymentsConflictError, PaymentsValidationError
from .models import MerchantAccount, MerchantEnvironment, ProviderKey

logger = logging.getLogger(__name__)

_PROVIDER = ProviderKey.WIPAY.value
#: The test checkout's amount: 1.00 XCD, the smallest sensible sandbox payment.
TEST_CHECKOUT_AMOUNT_MINOR = 100
#: The source of a test checkout: no booking, no customer, nothing is sold.
TEST_SOURCE_TYPE = "payments.wipay-test"


def _keys() -> list[str]:
    keys = organisations_settings.ORG_SECRET_ENCRYPTION_KEYS
    if not keys:
        raise SecretStorageUnavailableError()
    return keys


async def _row(session: AsyncSession, organisation_id: str) -> MerchantAccount | None:
    rows = await session.scalars(
        select(MerchantAccount).where(
            MerchantAccount.organisation_id == organisation_id,
            MerchantAccount.provider == _PROVIDER,
        )
    )
    return rows.first()


def _read(row: MerchantAccount) -> dict[str, str]:
    """The stored secrets. Needs the organisation keys; without them, 503."""
    keys = _keys()
    try:
        data = json.loads(secret_box.decrypt(row.credentials_encrypted, keys))
    except secret_box.SecretBoxError, ValueError:
        logger.error(
            "Merchant credentials cannot be read",
            extra={"organisation_id": row.organisation_id},
        )
        raise SecretStorageUnavailableError() from None
    if not isinstance(data, dict):
        raise SecretStorageUnavailableError()
    return {str(name): str(value) for name, value in data.items()}


def _public(row: MerchantAccount) -> schemas.MerchantAccountPublic:
    try:
        has_webhook = bool(_read(row).get("webhook_secret"))
    except SecretStorageUnavailableError:
        has_webhook = False
    return schemas.MerchantAccountPublic(
        provider=ProviderKey(row.provider),
        environment=MerchantEnvironment(row.environment),
        enabled=row.enabled,
        has_credentials=bool(row.credentials_encrypted),
        has_webhook_secret=has_webhook,
        sandbox_verified_at=row.sandbox_verified_at,
        live_approved_at=row.live_approved_at,
        updated_at=row.updated_at,
    )


async def list_accounts(
    session: AsyncSession, organisation_id: str
) -> list[schemas.MerchantAccountPublic]:
    rows = await session.scalars(
        select(MerchantAccount).where(
            MerchantAccount.organisation_id == organisation_id
        )
    )
    return [_public(row) for row in rows]


async def save(
    session: AsyncSession,
    *,
    organisation_id: str,
    actor: User,
    payload: schemas.MerchantAccountUpsert,
    _retry: bool = True,
) -> schemas.MerchantAccountPublic:
    keys = _keys()  # 503 before anything is read or written
    row = await _row(session, organisation_id)
    stored = _read(row) if row is not None else {}

    account_number = payload.account_number or stored.get("account_number")
    api_key = payload.api_key or stored.get("api_key")
    if not account_number or not api_key:
        raise PaymentsValidationError("An account number and an API key are needed")
    webhook_secret = payload.webhook_secret or stored.get("webhook_secret")
    blob = {"account_number": account_number, "api_key": api_key}
    if webhook_secret:
        blob["webhook_secret"] = webhook_secret
    ciphertext = secret_box.encrypt(json.dumps(blob), keys)

    environment = payload.environment.value
    if row is None:
        try:
            async with session.begin_nested():
                row = MerchantAccount(
                    organisation_id=organisation_id,
                    provider=_PROVIDER,
                    environment=environment,
                    enabled=payload.enabled,
                    credentials_encrypted=ciphertext,
                )
                session.add(row)
                await session.flush()
        except IntegrityError:
            # A concurrent first save created the row first: apply this save to it.
            if not _retry:
                raise
            return await save(
                session,
                organisation_id=organisation_id,
                actor=actor,
                payload=payload,
                _retry=False,
            )
        changes: dict[str, tuple[object, object]] = {
            "environment": (None, environment),
            "enabled": (None, payload.enabled),
        }
    else:
        credentials_changed = (account_number, api_key, webhook_secret) != (
            stored.get("account_number"),
            stored.get("api_key"),
            stored.get("webhook_secret"),
        )
        environment_changed = row.environment != environment
        changes = {
            "environment": (row.environment, environment),
            "enabled": (row.enabled, payload.enabled),
        }
        row.environment = environment
        row.enabled = payload.enabled
        row.credentials_encrypted = ciphertext
        if credentials_changed:
            changes["credentials"] = ("stored", "replaced")
        if credentials_changed or environment_changed:
            # A new environment or new secrets start again: live needs a new approval.
            row.sandbox_verified_at = None
            row.live_approved_at = None
            row.live_approved_by_user_id = None
        row.updated_at = utc_now()
    await session.flush()
    moved = {name: pair for name, pair in changes.items() if pair[0] != pair[1]}
    if moved:
        audit_service.set_actor(session, actor.id)
        await audit_service.record_change(
            session,
            entity_type="payment_merchant_account",
            entity_id=str(row.id),
            record_type="merchant_account",
            record_id=str(row.id),
            action="merchant_saved",
            changes=moved,
            organisation_id=organisation_id,
        )
    logger.info(
        "merchant account saved",
        extra={"organisation_id": organisation_id, "environment": environment},
    )
    return _public(row)


async def set_live_approval(
    session: AsyncSession,
    *,
    organisation_id: str,
    approved: bool,
    actor: User,
) -> schemas.MerchantAccountPublic:
    """The owner's live switch. Approval needs a verified sandbox payment first."""
    row = await _row(session, organisation_id)
    if row is None:
        raise PaymentsConflictError("This business has no WiPay account")
    if approved and row.sandbox_verified_at is None:
        raise PaymentsConflictError(
            "Run a test payment in the WiPay sandbox first; live is approved after it"
        )
    before = row.live_approved_at is not None
    row.live_approved_at = utc_now() if approved else None
    row.live_approved_by_user_id = actor.id if approved else None
    row.updated_at = utc_now()
    await session.flush()
    audit_service.set_actor(session, actor.id)
    await audit_service.record_change(
        session,
        entity_type="payment_merchant_account",
        entity_id=str(row.id),
        record_type="merchant_account",
        record_id=str(row.id),
        action="live_approval",
        changes={"live_approved": (before, approved)},
        organisation_id=organisation_id,
    )
    logger.info(
        "live payments approval changed",
        extra={"organisation_id": organisation_id, "approved": approved},
    )
    return _public(row)


async def start_test_checkout(
    session: AsyncSession,
    *,
    organisation_id: str,
    actor: User,
) -> schemas.PaymentCheckoutPublic:
    """An org admin's sandbox checkout with no booking and no customer. Its verified
    success records the sandbox proof, the only way to earn live approval in production.
    Needs the account set to sandbox (enabled); the WiPay sandbox is never used for a
    real booking in production (``wipay.load_provider``)."""
    row = await _row(session, organisation_id)
    if row is None:
        raise PaymentsConflictError("This business has no WiPay account")
    if row.environment != MerchantEnvironment.SANDBOX.value:
        raise PaymentsConflictError(
            "The test checkout uses the sandbox: set the account to sandbox first"
        )
    payload = schemas.PaymentIntentCreate(
        amount_minor=TEST_CHECKOUT_AMOUNT_MINOR,
        currency="XCD",
        provider=ProviderKey.WIPAY,
        source_type=TEST_SOURCE_TYPE,
        idempotency_key=uuid.uuid4().hex,
        metadata={"purpose": "sandbox_proof"},
    )
    return await service.create_intent(
        session,
        organisation_id=organisation_id,
        actor=actor,
        payload=payload,
        allow_sandbox_test=True,
    )
