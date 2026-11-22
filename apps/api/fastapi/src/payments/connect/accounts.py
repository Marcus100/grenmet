"""Stripe Connect accounts for New Zealand businesses (ADR-0027, test mode).

The business is the seller. Each organisation has at most one connected account
(its Stripe id is the only thing stored; no keys). A card payment is a direct charge
on that account, with an optional Barrels platform fee, once the account can take
charges and the charge is in New Zealand dollars. Until then, and for any other
currency, the payment stays a platform charge exactly as before Connect, so
onboarding never breaks an organisation's existing card payments. Test mode only:
the Stripe adapter refuses anything but an ``sk_test_`` key before a request is made.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations.models import PlatformOrganisation
from src.payments import schemas
from src.payments.exceptions import (
    ConnectAccountNotFoundError,
    PaymentsValidationError,
    ProviderRequestError,
    ProviderUnavailableError,
)
from src.payments.providers.stripe import StripeProvider
from src.utils.datetime import utc_now

from .config import connect_settings, is_https_url
from .models import ConnectedAccount

logger = logging.getLogger(__name__)

#: The only country Connect is used for: a New Zealand business, a New Zealand account.
NEW_ZEALAND = "NZ"
#: The currency a New Zealand connected account charges in.
CHARGE_CURRENCY = "NZD"
BPS_DENOMINATOR = 10000
#: A stored account state this recent is trusted at checkout: no live Stripe read
#: (issue 1658). A webhook or a status read keeps it current.
STATE_FRESH_FOR = timedelta(seconds=60)


@dataclass(frozen=True)
class ChargeRoute:
    """Where a card payment is charged: the business's account and the platform fee."""

    connected_account_id: str
    application_fee_minor: int


def _provider() -> StripeProvider:
    # Refuses a missing or non-test key (503) before any request is made.
    return StripeProvider()


def _return_address() -> str:
    address = connect_settings.CONNECT_RETURN_URL
    if not address or not is_https_url(address):
        raise ProviderUnavailableError(
            "Stripe onboarding return address is not configured"
        )
    return address


async def _row(session: AsyncSession, organisation_id: str) -> ConnectedAccount | None:
    return (
        await session.execute(
            select(ConnectedAccount).where(
                ConnectedAccount.organisation_id == organisation_id
            )
        )
    ).scalar_one_or_none()


def apply_snapshot(
    row: ConnectedAccount, snapshot: dict[str, Any], as_of: datetime
) -> None:
    """Store an Accounts v1 shaped account (from a read or an ``account.updated``)."""
    row.charges_enabled = snapshot.get("charges_enabled") is True
    row.payouts_enabled = snapshot.get("payouts_enabled") is True
    row.details_submitted = snapshot.get("details_submitted") is True
    due: set[str] = set()
    disabled: str | None = None
    requirements = snapshot.get("requirements")
    if isinstance(requirements, dict):
        for key in ("currently_due", "past_due"):
            items = requirements.get(key)
            if isinstance(items, list):
                due.update(item for item in items if isinstance(item, str))
        reason = requirements.get("disabled_reason")
        disabled = reason[:100] if isinstance(reason, str) and reason else None
    row.requirements_due = sorted(due)
    row.disabled_reason = disabled
    row.state_as_of = as_of


async def _refresh(session: AsyncSession, row: ConnectedAccount) -> bool:
    """Read the account from Stripe and store its state. False when Stripe cannot
    be read; the stored state then stays as it is.

    The read is taken as of the moment it was asked for. The row is locked and the
    state is applied only if nothing newer (a webhook) was stored while Stripe was
    being read, so a slow read cannot overwrite a newer event."""
    as_of = utc_now()
    try:
        snapshot = await _provider().retrieve_connected_account(row.stripe_account_id)
    except ProviderRequestError:
        logger.warning(
            "could not read a connected account; stored state kept",
            extra={"organisation_id": row.organisation_id},
        )
        return False
    # populate_existing: the row may already be in this session's identity map with
    # the state from before a webhook committed, and the check below must see the
    # newest state_as_of, not the stale copy.
    locked = (
        await session.execute(
            select(ConnectedAccount)
            .where(ConnectedAccount.id == row.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    if as_of > locked.state_as_of:
        apply_snapshot(locked, snapshot, as_of)
        await session.flush()
    else:
        logger.info(
            "newer account state already stored; read not applied",
            extra={"organisation_id": row.organisation_id},
        )
    return True


async def _refresh_if_stale(session: AsyncSession, row: ConnectedAccount) -> bool:
    """Read the account from Stripe only when the stored state is older than
    ``STATE_FRESH_FOR``. True when the state is current or was read."""
    if utc_now() - row.state_as_of < STATE_FRESH_FOR:
        return True
    return await _refresh(session, row)


async def ensure_account(session: AsyncSession, *, organisation_id: str) -> str:
    """Create the business's connected account the first time and return its id.

    Flushes only; the router commits before the onboarding link is requested, so an
    account that Stripe created is never lost when the link request fails. A retry
    reuses it (the Stripe request is keyed by organisation)."""
    _return_address()
    provider = _provider()
    row = await _row(session, organisation_id)
    if row is not None:
        return row.stripe_account_id
    name = await session.scalar(
        select(PlatformOrganisation.name).where(
            PlatformOrganisation.id == organisation_id
        )
    )
    account_id = await provider.create_connected_account(
        display_name=name or "Business", organisation_id=organisation_id
    )
    row = ConnectedAccount(
        organisation_id=organisation_id,
        stripe_account_id=account_id,
        country=NEW_ZEALAND,
        state_as_of=utc_now(),
    )
    try:
        async with session.begin_nested():
            session.add(row)
            await session.flush()
    except IntegrityError:
        # A concurrent request created the row first: use that one. Stripe gave
        # both requests the same account (keyed by organisation).
        existing = await _row(session, organisation_id)
        if existing is None:
            raise
        return existing.stripe_account_id
    logger.info("connected account created", extra={"organisation_id": organisation_id})
    return account_id


async def onboarding_link(account_id: str) -> str:
    """A hosted onboarding link for the account (no database access)."""
    return await _provider().create_account_link(
        account_id, return_url=_return_address()
    )


def _public(
    row: ConnectedAccount | None, *, synced: bool
) -> schemas.ConnectStatusPublic:
    if row is None:
        return schemas.ConnectStatusPublic(
            connected=False,
            connected_account_id=None,
            charges_enabled=False,
            payouts_enabled=False,
            details_submitted=False,
            requirements_due=[],
            disabled_reason=None,
            platform_fee_bps=0,
            synced=synced,
        )
    return schemas.ConnectStatusPublic(
        connected=True,
        connected_account_id=row.stripe_account_id,
        charges_enabled=row.charges_enabled,
        payouts_enabled=row.payouts_enabled,
        details_submitted=row.details_submitted,
        requirements_due=list(row.requirements_due or []),
        disabled_reason=row.disabled_reason,
        platform_fee_bps=row.platform_fee_bps,
        synced=synced,
    )


async def status_for(
    session: AsyncSession, *, organisation_id: str
) -> schemas.ConnectStatusPublic:
    """The business's account state, read from Stripe when it has an account."""
    row = await _row(session, organisation_id)
    if row is None:
        return _public(None, synced=True)
    synced = await _refresh(session, row)
    return _public(row, synced=synced)


async def charge_route(
    session: AsyncSession,
    *,
    organisation_id: str,
    amount_minor: int,
    currency: str,
) -> ChargeRoute | None:
    """Where a card payment for the business is charged, or None for the platform.

    None (the platform charge, as before Connect) when the business has no connected
    account, when its account cannot take charges yet (checked live when the stored
    state says not yet and is older than a minute), or when the charge is not in New
    Zealand dollars.
    Otherwise a direct charge on the business's account, with the platform fee: the
    fee is the stored rate capped at the platform cap, at charge time, and must be
    less than the charge.
    """
    if currency != CHARGE_CURRENCY:
        return None
    row = await _row(session, organisation_id)
    if row is None:
        return None
    if not row.charges_enabled:
        await _refresh_if_stale(session, row)
    if not row.charges_enabled:
        return None
    rate = min(row.platform_fee_bps, connect_settings.CONNECT_PLATFORM_FEE_CAP_BPS)
    fee = rate * amount_minor // BPS_DENOMINATOR
    if fee > 0 and row.country != NEW_ZEALAND:
        raise PaymentsValidationError(
            "A platform fee applies to New Zealand businesses only"
        )
    if fee >= amount_minor:
        raise PaymentsValidationError("The platform fee must be less than the charge")
    return ChargeRoute(
        connected_account_id=row.stripe_account_id, application_fee_minor=fee
    )


async def set_platform_fee(
    session: AsyncSession, *, organisation_id: str, fee_bps: int
) -> ConnectedAccount:
    """Set the Barrels fee on the business's card payments (superuser). At most the
    platform cap, and only for a New Zealand account. Flushes; the router commits."""
    row = await _row(session, organisation_id)
    if row is None:
        raise ConnectAccountNotFoundError()
    cap = connect_settings.CONNECT_PLATFORM_FEE_CAP_BPS
    if fee_bps > cap:
        raise PaymentsValidationError(
            f"The platform fee may be at most {cap} basis points"
        )
    if fee_bps > 0 and row.country != NEW_ZEALAND:
        raise PaymentsValidationError(
            "A platform fee applies to New Zealand businesses only"
        )
    row.platform_fee_bps = fee_bps
    await session.flush()
    logger.info(
        "platform fee set",
        extra={"organisation_id": organisation_id, "fee_bps": fee_bps},
    )
    return row


def fee_public(row: ConnectedAccount) -> schemas.ConnectFeePublic:
    return schemas.ConnectFeePublic(
        organisation_id=row.organisation_id, platform_fee_bps=row.platform_fee_bps
    )
