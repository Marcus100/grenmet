"""Organisation contact book (ADR-0028).

Functions flush and never commit; the caller owns the transaction. Other
domains call ``upsert_contact`` / ``find_by_email`` / ``set_consent``. People are
matched on the exact email hash only; ``merge_contacts`` is the one explicit way
to join two records. Logs never carry addresses, names or phone numbers.
"""

import logging
from collections.abc import Mapping, Sequence

from sqlalchemy import ColumnElement, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.pagination import PaginationParams
from src.utils.datetime import utc_now
from src.utils.email_hash import hash_email

from .audit import SUBJECT
from .exceptions import ContactErasedError, ContactMergeError, ContactNotFoundError
from .models import ConsentPurpose, Contact, ContactConsent

logger = logging.getLogger(__name__)

ERASURE_SOURCE = "erasure"
MANUAL_SOURCE = "manual"


async def get_contact(
    session: AsyncSession, organisation_id: str, contact_id: str
) -> Contact:
    """The contact, only if it belongs to ``organisation_id`` (else 404)."""
    contact = await session.scalar(
        select(Contact).where(
            Contact.id == contact_id, Contact.organisation_id == organisation_id
        )
    )
    if contact is None:
        raise ContactNotFoundError
    return contact


async def find_by_email(
    session: AsyncSession, organisation_id: str, email: str
) -> Contact | None:
    """Exact email-hash lookup within one organisation (erased contacts included)."""
    found: Contact | None = await session.scalar(
        select(Contact).where(
            Contact.organisation_id == organisation_id,
            Contact.email_hash == hash_email(email),
        )
    )
    return found


async def current_consents(
    session: AsyncSession, contact_id: str
) -> dict[ConsentPurpose, ContactConsent]:
    """Latest decision per purpose; purposes never decided are absent."""
    rows = await session.scalars(
        select(ContactConsent)
        .where(ContactConsent.contact_id == contact_id)
        .distinct(ContactConsent.purpose)
        .order_by(
            ContactConsent.purpose,
            ContactConsent.recorded_at.desc(),
            ContactConsent.id.desc(),
        )
    )
    return {ConsentPurpose(row.purpose): row for row in rows}


async def consent_history(
    session: AsyncSession, contact_id: str
) -> Sequence[ContactConsent]:
    result = await session.scalars(
        select(ContactConsent)
        .where(ContactConsent.contact_id == contact_id)
        .order_by(ContactConsent.recorded_at, ContactConsent.id)
    )
    return result.all()


async def set_consent(
    session: AsyncSession,
    contact: Contact,
    purpose: ConsentPurpose,
    granted: bool,
    *,
    source: str,
) -> ContactConsent:
    """Append a decision; earlier rows are never changed."""
    if contact.erased_at is not None:
        raise ContactErasedError
    now = utc_now()
    row = ContactConsent(
        contact_id=contact.id,
        organisation_id=contact.organisation_id,
        purpose=purpose.value,
        granted=granted,
        source=source,
        granted_at=now if granted else None,
        revoked_at=None if granted else now,
        recorded_at=now,
    )
    session.add(row)
    await session.flush()
    return row


async def _apply_consents(
    session: AsyncSession,
    contact: Contact,
    consents: Mapping[ConsentPurpose, bool],
    source: str,
) -> None:
    current = await current_consents(session, contact.id)
    for purpose, granted in consents.items():
        existing = current.get(purpose)
        if existing is not None and existing.granted == granted:
            continue  # no change, no new history row
        await set_consent(session, contact, purpose, granted, source=source)


async def upsert_contact(
    session: AsyncSession,
    organisation_id: str,
    *,
    email: str,
    name: str | None = None,
    phone: str | None = None,
    source: str,
    consents: Mapping[ConsentPurpose, bool] | None = None,
) -> Contact:
    """Create the contact for ``email`` or update the existing one.

    Matches the exact email hash only. Existing name and phone are kept when
    set (a form never overwrites curated details); blanks are filled. An erased
    contact that comes back is revived with only what is supplied now and no
    consent carried over.
    """
    contact = await find_by_email(session, organisation_id, email)
    if contact is None:
        contact = Contact(
            organisation_id=organisation_id,
            email_hash=hash_email(email),
            email=email.strip(),
            name=name,
            phone=phone,
            source=source,
        )
        try:
            async with session.begin_nested():
                session.add(contact)
                await session.flush()
        except IntegrityError:
            # A concurrent request created it first; use theirs.
            session.expunge(contact)
            contact = await find_by_email(session, organisation_id, email)
            if contact is None:
                raise
    else:
        if contact.erased_at is not None:
            contact.erased_at = None
            contact.name = None
            contact.phone = None
            contact.source = source
        contact.email = email.strip()
        if name and not contact.name:
            contact.name = name
        if phone and not contact.phone:
            contact.phone = phone
        await session.flush()
    if consents:
        await _apply_consents(session, contact, consents, source)
    return contact


async def update_contact(
    session: AsyncSession,
    contact: Contact,
    *,
    actor: User,
    fields: Mapping[str, str | None],
) -> Contact:
    """Change name or phone (the email is the identity and never edited)."""
    if contact.erased_at is not None:
        raise ContactErasedError
    audit_service.set_actor(session, actor.id)
    for key, value in fields.items():
        setattr(contact, key, value)
    await session.flush()
    return contact


async def merge_contacts(
    session: AsyncSession,
    actor: User,
    keep_id: str,
    drop_id: str,
    *,
    organisation_id: str,
) -> Contact:
    """Fold ``drop_id`` into ``keep_id`` (same organisation), audited.

    Consent history moves to the kept contact, whose ``created_at`` becomes the
    earlier of the two; blank name, phone and user link are filled from the
    dropped record. The dropped record is deleted.
    """
    if keep_id == drop_id:
        raise ContactMergeError("A contact cannot be merged into itself")
    keep = await get_contact(session, organisation_id, keep_id)
    drop = await get_contact(session, organisation_id, drop_id)
    if keep.erased_at is not None or drop.erased_at is not None:
        raise ContactErasedError
    audit_service.set_actor(session, actor.id)
    await session.execute(
        update(ContactConsent)
        .where(ContactConsent.contact_id == drop.id)
        .values(contact_id=keep.id)
    )
    keep.created_at = min(keep.created_at, drop.created_at)
    keep.name = keep.name or drop.name
    keep.phone = keep.phone or drop.phone
    keep.user_id = keep.user_id or drop.user_id
    await session.delete(drop)
    await audit_service.record_change(
        session,
        entity_type=SUBJECT,
        entity_id=organisation_id,
        record_type="contact",
        record_id=keep.id,
        action="merge",
        changes={"merged_contact_id": (None, drop_id)},
        organisation_id=organisation_id,
    )
    await session.flush()
    logger.info("Contact merged", extra={"organisation_id": organisation_id})
    return keep


async def erase_contact(
    session: AsyncSession, contact: Contact, *, actor: User | None = None
) -> Contact:
    """Blank personal details, keep the hash tombstone, revoke all consent."""
    if contact.erased_at is not None:
        return contact
    audit_service.set_actor(session, actor.id if actor else None)
    current = await current_consents(session, contact.id)
    for purpose, consent in current.items():
        if consent.granted:
            await set_consent(session, contact, purpose, False, source=ERASURE_SOURCE)
    contact.email = None
    contact.name = None
    contact.phone = None
    contact.user_id = None
    contact.erased_at = utc_now()
    await audit_service.record_change(
        session,
        entity_type=SUBJECT,
        entity_id=contact.organisation_id,
        record_type="contact",
        record_id=contact.id,
        action="erase",
        changes={"erased_at": (None, contact.erased_at)},
        organisation_id=contact.organisation_id,
    )
    await session.flush()
    logger.info("Contact erased", extra={"organisation_id": contact.organisation_id})
    return contact


def _search_filters(q: str | None) -> list[ColumnElement[bool]]:
    term = (q or "").strip()
    if not term:
        return []
    if "@" in term:
        return [Contact.email_hash == hash_email(term)]
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return [Contact.name.ilike(f"%{escaped}%", escape="\\")]


async def list_contacts(
    session: AsyncSession,
    *,
    organisation_id: str | None,
    q: str | None,
    include_erased: bool,
    pagination: PaginationParams,
) -> tuple[list[Contact], int]:
    """Page of contacts; ``organisation_id=None`` is the superuser view."""
    filters = _search_filters(q)
    if organisation_id is not None:
        filters.append(Contact.organisation_id == organisation_id)
    if not include_erased:
        filters.append(Contact.erased_at.is_(None))
    total = await session.scalar(
        select(func.count()).select_from(Contact).where(*filters)
    )
    rows = await session.scalars(
        select(Contact)
        .where(*filters)
        .order_by(Contact.created_at.desc(), Contact.id)
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return list(rows), total or 0
