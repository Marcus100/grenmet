"""A look-alike of a known customer's address needs the emailed code too (#1982).

The known-address check (#1969) matches the exact email hash. These tests book as a
variant of an address that is already a contact (``victim+x@gmail.com`` and
``vic.tim@gmail.com`` for ``victim@gmail.com``); Gmail delivers both to the same
inbox, so the variant must be refused without a proof, and must book in one pass
only when it really is a different mailbox.
"""

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.email_verification import ERROR_CODE
from tests.bookings.test_known_email_proof import (
    _booking_count,
    _contact_rows,
    _create,
    _known_studio,
)

KNOWN = "victim@gmail.com"


async def _refused_and_stored_nothing(
    db: AsyncSession, client: httpx.AsyncClient, email: str
) -> None:
    studio, slots = await _known_studio(db, client, email=KNOWN)
    bookings_before = await _booking_count(db, studio.org_id)
    contacts_before = await _contact_rows(db, studio.org_id)

    refused = await _create(client, studio, slots[-1], None, email=email)

    assert refused.status_code == 403, refused.text
    assert refused.json()["detail"].startswith(f"{ERROR_CODE}:")
    assert await _booking_count(db, studio.org_id) == bookings_before
    assert await _contact_rows(db, studio.org_id) == contacts_before


async def test_a_plus_tag_variant_of_a_known_gmail_address_is_refused_without_proof(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await _refused_and_stored_nothing(db_async, async_client, "victim+x@gmail.com")


async def test_a_dotted_variant_of_a_known_gmail_address_is_refused_without_proof(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await _refused_and_stored_nothing(db_async, async_client, "vic.tim@gmail.com")


async def test_a_googlemail_variant_of_a_known_gmail_address_is_refused_without_proof(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await _refused_and_stored_nothing(db_async, async_client, "v.ictim+x@googlemail.com")


async def test_a_dotted_address_at_a_provider_that_keeps_dots_books_in_one_pass(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # Outlook keeps dots, so vic.tim@ is a different mailbox from victim@ and
    # is not refused: it books in one pass as a new address.
    studio, slots = await _known_studio(db_async, async_client, email="victim@outlook.com")
    created = await _create(
        async_client, studio, slots[-1], None, email="vic.tim@outlook.com"
    )
    assert created.status_code == 201, created.text


async def test_the_variant_check_is_per_organisation(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # The known customer belongs to another business: this business does not know
    # the address, so the variant books in one pass.
    other, _ = await _known_studio(db_async, async_client, email=KNOWN)
    studio, slots = await _known_studio(db_async, async_client, email="someone@example.net")
    created = await _create(
        async_client, studio, slots[-1], None, email="vic.tim@gmail.com"
    )
    assert created.status_code == 201, created.text
    assert other.org_id != studio.org_id
