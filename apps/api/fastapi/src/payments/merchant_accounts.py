"""A business's own online-payment settings (ADR-0027 amendment, 21 Nov 2026).

- Credentials are one encrypted blob under the organisation keys
  (``ORG_SECRET_ENCRYPTION_KEYS``); with no keys saving is the existing 503.
- Responses never carry a secret. A blank secret on save keeps the stored one.
- Changing the account number or the API key starts again: no sandbox proof and no
  live approval carry over. Changing the environment to live needs the owner's
  approval (``set_live_approval``), which needs a verified sandbox payment first.
Service functions flush; routers commit.
"""

import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.organisations.config import organisations_settings
from src.organisations.exceptions import SecretStorageUnavailableError
from src.utils import secret_box
from src.utils.datetime import utc_now

from . import schemas
from .exceptions import PaymentsConflictError, PaymentsValidationError
from .models import MerchantAccount, MerchantEnvironment, ProviderKey

logger = logging.getLogger(__name__)

_PROVIDER = ProviderKey.WIPAY.value


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
        row = MerchantAccount(
            organisation_id=organisation_id,
            provider=_PROVIDER,
            environment=environment,
            enabled=payload.enabled,
            credentials_encrypted=ciphertext,
        )
        session.add(row)
        changes: dict[str, tuple[object, object]] = {
            "environment": (None, environment),
            "enabled": (None, payload.enabled),
        }
    else:
        new_account = (account_number, api_key) != (
            stored.get("account_number"),
            stored.get("api_key"),
        )
        changes = {
            "environment": (row.environment, environment),
            "enabled": (row.enabled, payload.enabled),
        }
        row.environment = environment
        row.enabled = payload.enabled
        row.credentials_encrypted = ciphertext
        if new_account:
            changes["credentials"] = ("stored", "replaced")
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
