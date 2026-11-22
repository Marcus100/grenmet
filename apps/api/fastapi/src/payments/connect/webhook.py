"""The Connect webhook endpoint (ADR-0027, New Zealand, test mode).

Stripe sends events from connected accounts (direct charges, refunds, disputes and
account updates) to a Connect endpoint with its own signing secret, separate from the
platform endpoint. Each event carries ``account``: the connected account it is about.
The signature is verified with the Connect secret; an unknown or unsigned event is
refused (400). Every handler is idempotent: a replay changes nothing and still answers 2xx.
"""

import json
import logging
import time
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.payments import service
from src.payments.config import payments_settings
from src.payments.exceptions import InvalidCallbackError, ProviderUnavailableError
from src.payments.providers.stripe import (
    WHSEC_PREFIX,
    StripeProvider,
    normalise_event,
    verify_signature,
)

from . import accounts, disputes
from .config import connect_settings
from .models import ConnectedAccount

logger = logging.getLogger(__name__)

#: The Connect event types this endpoint acts on. Others are answered and dropped.
ACCOUNT_EVENT = "account.updated"
DISPUTE_EVENT = "charge.dispute.created"


def _verify(headers: Mapping[str, str], body: bytes) -> dict[str, Any]:
    secret = connect_settings.STRIPE_CONNECT_WEBHOOK_SECRET
    if not secret or not secret.startswith(WHSEC_PREFIX):
        logger.error("Stripe Connect webhook secret is missing or malformed")
        raise ProviderUnavailableError("Stripe Connect webhooks are not configured")
    # The same test-mode guard as every Stripe call: a live key refuses (503) here too.
    StripeProvider()
    verify_signature(
        headers.get("stripe-signature"),
        body,
        secret,
        tolerance_seconds=payments_settings.WEBHOOK_TOLERANCE_SECONDS,
        now=time.time(),
    )
    try:
        event = json.loads(body)
    except ValueError:
        raise InvalidCallbackError() from None
    if not isinstance(event, dict):
        raise InvalidCallbackError()
    return event


async def process_connect_webhook(
    session: AsyncSession, *, headers: Mapping[str, str], body: bytes
) -> str:
    """Verify and apply one Connect event. Returns ``processed``, ``duplicate`` or
    ``ignored``. Raises 400 for a bad signature and 503 when not configured."""
    event = _verify(headers, body)
    account_id = event.get("account")
    if not isinstance(account_id, str) or not account_id:
        # A Connect endpoint only sends events about connected accounts.
        return "ignored"
    event_type = event.get("type")
    data = event.get("data")
    obj = data.get("object") if isinstance(data, dict) else None
    if not isinstance(event_type, str) or not isinstance(obj, dict):
        raise InvalidCallbackError()

    if event_type == ACCOUNT_EVENT:
        return await _apply_account(session, account_id, obj, event.get("created"))
    if event_type == DISPUTE_EVENT:
        row = await _account_row(session, account_id)
        if row is None:
            logger.warning(
                "dispute for an unknown connected account; ignored",
                extra={"event_id": str(event.get("id"))},
            )
            return "ignored"
        return await disputes.record_dispute(
            session,
            organisation_id=row.organisation_id,
            connected_account_id=account_id,
            dispute=obj,
        )
    provider_event = normalise_event(event)
    return await service.apply_event(
        session, provider_event, connected_account=account_id
    )


async def _account_row(
    session: AsyncSession, account_id: str
) -> ConnectedAccount | None:
    return (
        await session.execute(
            select(ConnectedAccount)
            .where(ConnectedAccount.stripe_account_id == account_id)
            .with_for_update()
        )
    ).scalar_one_or_none()


async def _apply_account(
    session: AsyncSession, account_id: str, obj: dict[str, Any], created: object
) -> str:
    """An ``account.updated``: the account's state as of the event. An event older
    than the state we already hold is ignored, so a late delivery cannot undo it."""
    if obj.get("id") not in (None, account_id):
        return "ignored"
    row = await _account_row(session, account_id)
    if row is None:
        return "ignored"
    if not isinstance(created, int) or isinstance(created, bool):
        return "ignored"
    as_of = datetime.fromtimestamp(created, UTC).replace(tzinfo=None)
    if as_of <= row.state_as_of:
        logger.info(
            "older account update ignored",
            extra={"organisation_id": row.organisation_id},
        )
        return "ignored"
    accounts.apply_snapshot(row, obj, as_of)
    await session.flush()
    return "processed"
