"""Stripe Connect accounts for New Zealand businesses (ADR-0027, test mode).

The business is the seller. Each organisation has at most one connected account
(its Stripe id is the only thing stored; no keys). Card payments are direct charges
on that account, with an optional Barrels platform fee. Test mode only: the Stripe
adapter refuses anything but an ``sk_test_`` key before a request is made.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations.models import PlatformOrganisation
from src.payments import schemas
from src.payments.exceptions import (
    ConnectAccountNotFoundError,
    ConnectNotReadyError,
    PaymentsValidationError,
    ProviderRequestError,
    ProviderUnavailableError,
)
from src.payments.providers.stripe import StripeProvider
from src.utils.datetime import utc_now

from .config import connect_settings
from .models import ConnectedAccount

logger = logging.getLogger(__name__)

#: The only country Connect is used for: a New Zealand business, a New Zealand account.
NEW_ZEALAND = "NZ"
#: The currency a New Zealand connected account charges in.
CHARGE_CURRENCY = "NZD"
BPS_DENOMINATOR = 10000


@dataclass(frozen=True)
class ChargeRoute:
    """Where a card payment is charged: the business's account and the platform fee."""

    connected_account_id: str
    application_fee_minor: int


def _provider() -> StripeProvider:
    # Refuses a missing or non-test key (503) before any request is made.
    return StripeProvider()


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
    be read; the stored state then stays as it is."""
    as_of = utc_now()
    try:
        snapshot = await _provider().retrieve_connected_account(row.stripe_account_id)
    except ProviderRequestError:
        logger.warning(
            "could not read a connected account; stored state kept",
            extra={"organisation_id": row.organisation_id},
        )
        return False
    apply_snapshot(row, snapshot, as_of)
    await session.flush()
    return True


async def start_onboarding(session: AsyncSession, *, organisation_id: str) -> str:
    """The hosted onboarding link for the business's account, creating the account
    the first time. Flushes; the router commits."""
    return_url = connect_settings.CONNECT_RETURN_URL
    if not return_url:
        raise ProviderUnavailableError("Stripe onboarding is not configured")
    provider = _provider()
    row = await _row(session, organisation_id)
    if row is None:
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
            row = existing
        logger.info(
            "connected account created",
            extra={"organisation_id": organisation_id},
        )
    return await provider.create_account_link(
        row.stripe_account_id, return_url=return_url
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
    """Where a card payment for the business is charged.

    None when the business has no connected account: the charge stays on the
    platform account, as it did before Connect. Otherwise the business must have
    finished onboarding (checked live once when the stored state says not yet), the
    charge is in New Zealand dollars, and the platform fee is less than the charge.
    """
    row = await _row(session, organisation_id)
    if row is None:
        return None
    if not row.charges_enabled:
        await _refresh(session, row)
    if not row.charges_enabled:
        raise ConnectNotReadyError()
    if currency != CHARGE_CURRENCY:
        raise PaymentsValidationError(
            "Card payments for New Zealand businesses are charged in NZD"
        )
    fee = row.platform_fee_bps * amount_minor // BPS_DENOMINATOR
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
