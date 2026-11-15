"""Account link rules in the contacts service (ADR-0058, follow-ups of #1383 / #1384).

The link re-reads the account's email and verification under its row lock, so an
address the person no longer holds cannot link. Unlink and link write value-free
audit rows with no actor, and a merge names the person who merged.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.contacts import service
from src.contacts.models import Contact
from src.organisations.models import MembershipRole
from tests.factories import make_user
from tests.organisations.support import make_org


def _address(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@example.com"


async def _org_id(db: AsyncSession) -> str:
    owner = await make_user(db)
    org = await make_org(
        db,
        f"Link {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER),),
        apps=("contacts",),
    )
    return org.id


async def _audit(db: AsyncSession, contact_id: str) -> list[AuditEntry]:
    return list(
        (
            await db.scalars(
                select(AuditEntry)
                .where(
                    AuditEntry.record_type == "contact",
                    AuditEntry.record_id == contact_id,
                )
                .order_by(AuditEntry.created_at, AuditEntry.id)
            )
        ).all()
    )


async def test_a_link_uses_the_address_the_account_holds_now(db_async: AsyncSession):
    """A booking that loaded the payer before an email change must not link on the
    old address: the account's current email, read under its lock, decides."""
    org_id = await _org_id(db_async)
    old = _address("before")
    new = _address("after")
    account = await make_user(db_async, email=old)
    account.email = new
    await db_async.commit()
    contact = await service.upsert_contact(
        db_async, org_id, email=old, source="bookings"
    )

    linked = await service.link_verified_account(
        db_async, contact, booking_email=old, user_id=account.id
    )

    assert linked is False
    assert contact.user_id is None


async def test_a_link_follows_the_current_address_and_verification(
    db_async: AsyncSession,
):
    org_id = await _org_id(db_async)
    email = _address("current")
    account = await make_user(db_async, email=email)
    contact = await service.upsert_contact(
        db_async, org_id, email=email, source="bookings"
    )
    assert await service.link_verified_account(
        db_async, contact, booking_email=email, user_id=account.id
    )

    unverified_email = _address("unverified")
    unverified = await make_user(db_async, email=unverified_email, verified=False)
    other = await service.upsert_contact(
        db_async, org_id, email=unverified_email, source="bookings"
    )
    linked = await service.link_verified_account(
        db_async, other, booking_email=unverified_email, user_id=unverified.id
    )
    assert linked is False
    assert other.user_id is None


async def test_link_and_unlink_write_value_free_rows_with_no_actor(
    db_async: AsyncSession,
):
    org_id = await _org_id(db_async)
    email = _address("audit")
    account = await make_user(db_async, email=email)
    contact = await service.upsert_contact(
        db_async, org_id, email=email, source="bookings"
    )
    await service.link_verified_account(
        db_async, contact, booking_email=email, user_id=account.id
    )

    cleared = await service.unlink_account(db_async, account.id)
    await db_async.commit()

    assert cleared == 1
    rows = [
        row
        for row in await _audit(db_async, contact.id)
        if row.action in {"link_account", "unlink_account"}
    ]
    assert [row.action for row in rows] == ["link_account", "unlink_account"]
    assert all(row.actor_user_id is None for row in rows)
    text = repr([row.changes for row in rows])
    assert str(account.id) not in text
    assert email not in text


async def test_unlink_clears_every_link_of_the_account_only(db_async: AsyncSession):
    org_one = await _org_id(db_async)
    org_two = await _org_id(db_async)
    email = _address("two-orgs")
    account = await make_user(db_async, email=email)
    other = await make_user(db_async, email=_address("someone-else"))
    first = await service.upsert_contact(
        db_async, org_one, email=email, source="bookings"
    )
    second = await service.upsert_contact(
        db_async, org_two, email=email, source="bookings"
    )
    bystander = await service.upsert_contact(
        db_async, org_two, email=other.email, source="bookings"
    )
    await service.link_verified_account(
        db_async, first, booking_email=email, user_id=account.id
    )
    await service.link_verified_account(
        db_async, second, booking_email=email, user_id=account.id
    )
    await service.link_verified_account(
        db_async, bystander, booking_email=other.email, user_id=other.id
    )

    cleared = await service.unlink_account(db_async, account.id)
    await db_async.commit()

    assert cleared == 2
    assert await db_async.get(Contact, first.id) is not None
    assert (await db_async.get(Contact, first.id)).user_id is None
    assert (await db_async.get(Contact, second.id)).user_id is None
    assert (await db_async.get(Contact, bystander.id)).user_id == other.id


async def test_unlink_with_nothing_linked_writes_nothing(db_async: AsyncSession):
    account = await make_user(db_async, email=_address("unlinked"))

    assert await service.unlink_account(db_async, account.id) == 0
