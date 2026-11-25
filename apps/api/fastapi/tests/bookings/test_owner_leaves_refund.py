"""Slice 2 follow-up (a): the last owner leaving never calls the payment provider inside
the account deletion. A deposit held by a request that is declined is refunded by the
outbox worker after the deletion commits.
"""

import uuid
from typing import Any

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.auth import service as auth_service
from src.auth.models import User
from src.bookings import deposit_payments
from src.bookings.models import Booking, BookingProfile
from src.organisations.models import (
    Membership,
    MembershipRole,
    PlatformOrganisation,
)
from src.outbox import Outbox
from src.payments import service as payments_service
from tests.bookings.test_deposits import DEPOSIT, _paid_booking, _refunded
from tests.bookings.test_public_bookings import Studio


async def _mark_self_created(db: AsyncSession, studio: Studio) -> User:
    """Make the studio's first owner the creator of a self-created business."""
    owner_id = await db.scalar(
        select(Membership.user_id).where(
            Membership.organisation_id == studio.org_id,
            Membership.role == MembershipRole.OWNER.value,
        )
    )
    assert owner_id is not None
    await db.execute(
        update(PlatformOrganisation)
        .where(PlatformOrganisation.id == studio.org_id)
        .values(created_by_user_id=owner_id)
    )
    await db.execute(
        update(BookingProfile)
        .where(BookingProfile.organisation_id == studio.org_id)
        .values(owner_provider_id=uuid.UUID(studio.provider_ids[0]))
    )
    await db.commit()
    owner = await db.get(User, owner_id)
    assert owner is not None
    return owner


async def test_the_last_owner_leaving_queues_the_deposit_refund(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    studio, booking_id = await _paid_booking(
        db_async, async_client, requires_confirmation=True
    )
    owner = await _mark_self_created(db_async, studio)

    provider_calls: list[object] = []
    real_refund = payments_service.refund_intent

    async def spy(*args: Any, **kwargs: Any) -> Any:
        provider_calls.append(kwargs.get("intent_id"))
        return await real_refund(*args, **kwargs)

    monkeypatch.setattr(payments_service, "refund_intent", spy)

    await auth_service.delete_user(session=db_async, user=owner)
    await db_async.commit()

    # The provider is not called while the account deletion runs.
    assert provider_calls == []
    booking = await db_async.get(Booking, uuid.UUID(booking_id))
    assert booking is not None
    assert booking.status == "cancelled"
    queued = await db_async.scalar(
        select(Outbox).where(Outbox.topic == deposit_payments.REFUND_TOPIC)
    )
    assert queued is not None
    assert queued.status == "pending"

    # The worker runs the refund afterwards, in its own transaction.
    await outbox.drain(db_async, only_topics={deposit_payments.REFUND_TOPIC})
    assert len(provider_calls) == 1
    assert await _refunded(db_async, booking_id) == -DEPOSIT
