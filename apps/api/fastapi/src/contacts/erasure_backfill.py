"""One-off backfill: erasure's clearing rules for contacts erased before they existed (#2028).

``erase_contact`` returns at once for a contact that is already erased, so every
clearing rule erasure learned later only ever reached later erasures. This job
applies the same rules to the erased contacts that still hold a copy of the
person's details:

* the copies (booking notes and copied names, event notes, cancel reasons, walk-in
  order names and phones) are cleared by ``references.erase_all``, the hooks that
  erasure itself runs. There are no parallel UPDATE statements here.
* the mail (queued rows deleted, sent rows redacted) is cleared by
  ``address_log.clear_contact_mail``, the call erasure makes, once per matched address.

Safety rules:

* Only contacts with ``erased_at`` set are selected. A live contact is never selected.
* Mail is matched to an erased tombstone only: the same organisation and the HMAC
  ``email_hash`` of the logged address. An address that matches no erased contact is
  left alone, and so is mail of a business other than the erasing one.
* A contact is selected while it still holds a copy. A committed batch drops out of
  that set, so a rerun selects nothing it has already done. Each batch locks its
  contacts and re-reads ``erased_at`` under the lock, so a contact revived meanwhile is
  skipped.
* Each batch counts what it holds, runs the hooks, checks that no copy remains and
  only then commits. If the check fails the batch is rolled back and the job stops.

Run once by enqueueing the worker job ``backfill_erased_contact_copies``. Each batch
commits on its own, so a crash leaves whole batches done and the rest for the next run.
"""

import logging
from dataclasses import asdict, dataclass
from typing import Any

from sqlalchemy import ColumnElement, exists, func, literal, or_, select, tuple_, union
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import Booking, BookingEvent, Customer
from src.events.models import Order
from src.notifications.address_log import clear_contact_mail
from src.notifications.models import OutboundEmail
from src.notifications.outbox_handlers import EMAIL_SEND
from src.outbox import Outbox
from src.utils.email_hash import hash_email

from . import references
from .models import Contact

logger = logging.getLogger(__name__)

BATCH_SIZE = 100
MAIL_BATCH_SIZE = 500


class ErasureBackfillError(RuntimeError):
    """A batch's hooks left a copy behind. The batch is rolled back and the job stops."""


@dataclass
class BackfillResult:
    """What one run touched. Every count is logged, so a run that did nothing reads as
    zeros, not as silence."""

    #: Erased contacts whose copies were cleared.
    contacts: int = 0
    #: ``bookings.booking`` rows holding a booked name, notes or a cancel reason.
    booking_rows: int = 0
    #: ``bookings.booking_event`` rows holding a note.
    booking_event_rows: int = 0
    #: ``events.orders`` walk-in rows holding a name or phone.
    order_rows: int = 0
    #: Erased (organisation, address) matches whose mail was purged.
    mail_addresses: int = 0
    #: Queued mail rows deleted plus sent rows redacted.
    mail_rows: int = 0
    #: Erased contacts still holding a copy when the run ended (a locked contact is
    #: skipped and counted here; a rerun clears it).
    contacts_remaining: int = 0

    def as_dict(self) -> dict[str, int]:
        return asdict(self)


def _booking_copy() -> ColumnElement[bool]:
    return or_(
        Booking.booked_name.is_not(None),
        Booking.notes.is_not(None),
        Booking.cancel_reason.is_not(None),
    )


def _event_copy() -> ColumnElement[bool]:
    return BookingEvent.note.is_not(None)


def _order_copy() -> ColumnElement[bool]:
    return or_(Order.buyer_name.is_not(None), Order.buyer_phone.is_not(None))


def _holds_copy() -> ColumnElement[bool]:
    """SQL, on an ``org.contact`` row: a copy of its details is still stored somewhere
    the erase hooks reach. Keep this in step with the hooks it selects for."""
    return or_(
        exists().where(
            Customer.contact_id == Contact.id,
            Booking.customer_id == Customer.id,
            _booking_copy(),
        ),
        exists().where(
            Customer.contact_id == Contact.id,
            Booking.customer_id == Customer.id,
            BookingEvent.booking_id == Booking.id,
            _event_copy(),
        ),
        exists().where(Order.contact_id == Contact.id, _order_copy()),
    )


async def _copy_counts(session: AsyncSession, ids: list[str]) -> tuple[int, int, int]:
    """Rows per table that hold a copy for these contacts, counted before the hooks run."""
    bookings = await session.scalar(
        select(func.count(Booking.id))
        .join(Customer, Customer.id == Booking.customer_id)
        .where(Customer.contact_id.in_(ids), _booking_copy())
    )
    events = await session.scalar(
        select(func.count(BookingEvent.id))
        .join(Booking, Booking.id == BookingEvent.booking_id)
        .join(Customer, Customer.id == Booking.customer_id)
        .where(Customer.contact_id.in_(ids), _event_copy())
    )
    orders = await session.scalar(
        select(func.count(Order.id)).where(Order.contact_id.in_(ids), _order_copy())
    )
    return int(bookings or 0), int(events or 0), int(orders or 0)


async def _clear_contact_batch(
    session: AsyncSession, *, batch_size: int, result: BackfillResult
) -> bool:
    """Clear one batch of erased contacts that still hold a copy. False when none is left."""
    ids = list(
        await session.scalars(
            select(Contact.id)
            .where(Contact.erased_at.is_not(None), _holds_copy())
            .order_by(Contact.id)
            .limit(batch_size)
            .with_for_update(of=Contact, skip_locked=True)
        )
    )
    if not ids:
        return False
    booking_rows, event_rows, order_rows = await _copy_counts(session, ids)
    for contact_id in ids:
        await references.erase_all(session, contact_id=contact_id)
    leftover = list(
        await session.scalars(
            select(Contact.id).where(Contact.id.in_(ids), _holds_copy())
        )
    )
    if leftover:
        await session.rollback()
        raise ErasureBackfillError(
            f"{len(leftover)} erased contact(s) still hold a copy after the erase hooks"
        )
    await session.commit()
    result.contacts += len(ids)
    result.booking_rows += booking_rows
    result.booking_event_rows += event_rows
    result.order_rows += order_rows
    return True


def _mail_pairs(after: tuple[str, str] | None, batch_size: int) -> Any:
    """Distinct (organisation, address) pairs of logged and queued mail, keyset-paged,
    for organisations that hold an erased contact with a tombstone."""
    erased_orgs = (
        select(Contact.organisation_id)
        .where(Contact.erased_at.is_not(None), Contact.email_hash.is_not(None))
        .distinct()
    )
    logged = select(
        OutboundEmail.organisation_id.label("org"),
        OutboundEmail.to_email.label("address"),
    ).where(OutboundEmail.organisation_id.is_not(None))
    queued = select(
        Outbox.organisation_id.label("org"),
        Outbox.payload["to_email"].astext.label("address"),
    ).where(Outbox.topic == EMAIL_SEND, Outbox.organisation_id.is_not(None))
    pairs = union(logged, queued).subquery("pairs")
    query = select(pairs.c.org, pairs.c.address).where(
        pairs.c.org.in_(erased_orgs), pairs.c.address.is_not(None)
    )
    if after is not None:
        after_org, after_address = after
        query = query.where(
            tuple_(pairs.c.org, pairs.c.address)
            > tuple_(literal(after_org), literal(after_address))
        )
    return query.order_by(pairs.c.org, pairs.c.address).limit(batch_size)


async def _purge_mail_batch(
    session: AsyncSession,
    *,
    after: tuple[str, str] | None,
    batch_size: int,
    result: BackfillResult,
) -> tuple[str, str] | None:
    """Purge the mail of one keyset page. Returns the page's last key, None when no page is left."""
    rows = (await session.execute(_mail_pairs(after, batch_size))).all()
    if not rows:
        return None
    wanted: dict[tuple[str, str], str] = {}
    for org, address in rows:
        if address and address.strip():
            wanted.setdefault((org, hash_email(address)), address)
    if wanted:
        matched = (
            await session.execute(
                select(Contact.organisation_id, Contact.email_hash).where(
                    Contact.erased_at.is_not(None),
                    tuple_(Contact.organisation_id, Contact.email_hash).in_(
                        list(wanted)
                    ),
                )
            )
        ).all()
        for org, digest in matched:
            address = wanted[(org, digest)]
            result.mail_addresses += 1
            result.mail_rows += await clear_contact_mail(
                session, organisation_id=org, email=address
            )
    await session.commit()
    last = rows[-1]
    return (last.org, last.address)


async def backfill_erased_copies(
    session: AsyncSession,
    *,
    batch_size: int = BATCH_SIZE,
    mail_batch_size: int = MAIL_BATCH_SIZE,
) -> BackfillResult:
    """Apply erasure's clearing rules to every erased contact still holding a copy, then
    purge the mail of erased addresses. Commits per batch; a rerun changes nothing it
    has already done. Raises ``ErasureBackfillError`` if a batch's hooks leave a copy."""
    result = BackfillResult()
    while await _clear_contact_batch(session, batch_size=batch_size, result=result):
        pass
    result.contacts_remaining = int(
        await session.scalar(
            select(func.count(Contact.id)).where(
                Contact.erased_at.is_not(None), _holds_copy()
            )
        )
        or 0
    )
    after: tuple[str, str] | None = None
    while True:
        last = await _purge_mail_batch(
            session, after=after, batch_size=mail_batch_size, result=result
        )
        if last is None:
            break
        after = last
    logger.info("Erased-contact backfill finished", extra=result.as_dict())
    return result
