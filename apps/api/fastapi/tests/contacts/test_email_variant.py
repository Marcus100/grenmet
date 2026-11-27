"""Variant email hash (issue #1982): known-address look-alikes, and never identity."""

import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.contacts import service
from src.contacts.models import Contact
from src.utils.email_hash import (
    hash_email,
    hash_email_variant,
    normalise_email_variant,
)
from tests.factories import make_user
from tests.organisations.support import make_org

# --- pure rule --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("address", "variant"),
    [
        ("victim@gmail.com", "victim@gmail.com"),
        ("victim+x@gmail.com", "victim@gmail.com"),
        ("vic.tim@gmail.com", "victim@gmail.com"),
        ("  Vic.Tim+Shop@GMAIL.com ", "victim@gmail.com"),
        ("vic.tim@googlemail.com", "victim@gmail.com"),
        ("v.i.c.t.i.m+a+b@gmail.com", "victim@gmail.com"),
        # Dots are kept at a provider that does not ignore them.
        ("vic.tim@example.com", "vic.tim@example.com"),
        ("victim+x@example.com", "victim@example.com"),
        ("vic.tim@outlook.com", "vic.tim@outlook.com"),
    ],
)
def test_variant_form(address: str, variant: str) -> None:
    assert normalise_email_variant(address) == variant


def test_variant_hash_is_the_same_hmac_over_the_variant_form() -> None:
    assert hash_email_variant("vic.tim+x@gmail.com") == hash_email("victim@gmail.com")
    assert hash_email_variant("vic.tim@example.com") != hash_email("victim@example.com")


def test_a_dotted_address_at_a_non_listed_provider_is_a_different_variant() -> None:
    assert hash_email_variant("vic.tim@example.com") != hash_email_variant(
        "victim@example.com"
    )


# --- service ----------------------------------------------------------------------


def _address(stem: str) -> str:
    """A unique address so tests in one database never see each other's contacts."""
    return f"{stem}{uuid.uuid4().hex[:8]}@gmail.com"


async def _org(db: AsyncSession) -> str:
    org = await make_org(db, f"Shop {uuid.uuid4().hex[:6]}")
    return org.id


async def _owner(db: AsyncSession) -> User:
    return await make_user(db)


async def _contact_count(db: AsyncSession, organisation_id: str) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(Contact)
            .where(Contact.organisation_id == organisation_id)
        )
        or 0
    )


@pytest.mark.asyncio
async def test_look_alike_addresses_count_as_the_known_customer(
    db_async: AsyncSession,
) -> None:
    org = await _org(db_async)
    stem = uuid.uuid4().hex[:8]
    known = f"victim{stem}@gmail.com"
    await service.upsert_contact(db_async, org, email=known, source="bookings")

    assert await service.is_known_address(db_async, org, known)
    assert await service.is_known_address(db_async, org, f"victim{stem}+x@gmail.com")
    assert await service.is_known_address(db_async, org, f"vic.tim{stem}@gmail.com")
    assert await service.is_known_address(db_async, org, f"VICTIM{stem}+a@Gmail.com")


@pytest.mark.asyncio
async def test_a_dotted_address_at_a_provider_that_keeps_dots_is_not_the_same(
    db_async: AsyncSession,
) -> None:
    org = await _org(db_async)
    stem = uuid.uuid4().hex[:8]
    await service.upsert_contact(
        db_async, org, email=f"vic.tim{stem}@example.com", source="bookings"
    )

    assert not await service.is_known_address(
        db_async, org, f"victim{stem}@example.com"
    )
    assert not await service.is_known_address(db_async, org, f"vic{stem}@example.com")
    assert await service.is_known_address(db_async, org, f"vic.tim{stem}@example.com")


@pytest.mark.asyncio
async def test_an_unknown_address_is_not_known(db_async: AsyncSession) -> None:
    org = await _org(db_async)
    await service.upsert_contact(db_async, org, email=_address("a"), source="manual")
    assert not await service.is_known_address(db_async, org, _address("zz"))


@pytest.mark.asyncio
async def test_find_by_email_keeps_its_exact_contract(db_async: AsyncSession) -> None:
    org = await _org(db_async)
    stem = uuid.uuid4().hex[:8]
    await service.upsert_contact(
        db_async, org, email=f"victim{stem}@gmail.com", source="bookings"
    )
    assert (
        await service.find_by_email(db_async, org, f"victim{stem}+x@gmail.com") is None
    )
    assert (
        await service.find_by_email(db_async, org, f"vic.tim{stem}@gmail.com") is None
    )


@pytest.mark.asyncio
async def test_two_contacts_with_one_variant_form_stay_two_rows(
    db_async: AsyncSession,
) -> None:
    """The variant form is not identity: colliding forms never merge people.

    At a provider that keeps ``+tag`` mailboxes apart, these three are three
    people who share one variant form (``victim{stem}@example.com``). Gmail forms
    are not used here: at Gmail they are one mailbox, not three people.
    """
    org = await _org(db_async)
    stem = uuid.uuid4().hex[:8]
    first = await service.upsert_contact(
        db_async, org, email=f"victim{stem}@example.com", name="Ada", source="bookings"
    )
    second = await service.upsert_contact(
        db_async,
        org,
        email=f"victim{stem}+a@example.com",
        name="Grace",
        source="bookings",
    )
    third = await service.upsert_contact(
        db_async, org, email=f"victim{stem}+b@example.com", source="bookings"
    )

    assert len({first.id, second.id, third.id}) == 3
    assert first.email_variant_hash == second.email_variant_hash
    assert first.email_variant_hash == third.email_variant_hash
    assert first.email_hash != second.email_hash
    assert second.name == "Grace"  # the name was not written onto Ada's record
    assert first.name == "Ada"
    assert await _contact_count(db_async, org) == 3


@pytest.mark.asyncio
async def test_upsert_populates_the_variant_hash_on_every_write(
    db_async: AsyncSession,
) -> None:
    org = await _org(db_async)
    stem = uuid.uuid4().hex[:8]
    created = await service.upsert_contact(
        db_async, org, email=f"vic.tim{stem}+x@gmail.com", source="bookings"
    )
    assert created.email_variant_hash == hash_email_variant(f"victim{stem}@gmail.com")
    again = await service.upsert_contact(
        db_async, org, email=f"vic.tim{stem}+x@gmail.com", source="bookings"
    )
    assert again.id == created.id
    assert again.email_variant_hash == created.email_variant_hash


@pytest.mark.asyncio
async def test_an_erased_contact_still_matches_on_its_exact_address(
    db_async: AsyncSession,
) -> None:
    owner = await _owner(db_async)
    org = await _org(db_async)
    stem = uuid.uuid4().hex[:8]
    address = f"erased{stem}@gmail.com"
    contact = await service.upsert_contact(
        db_async, org, email=address, source="manual"
    )
    await service.erase_contact(db_async, contact, actor=owner)

    assert contact.email is None
    # Erasure clears the variant hash: the exact tombstone alone identifies it.
    assert contact.email_variant_hash is None
    assert contact.email_hash == hash_email(address)
    assert await service.is_known_address(db_async, org, address)
    # Variants of an erased address are not matched (no second identifier kept).
    assert not await service.is_known_address(
        db_async, org, f"erased.{stem}+x@gmail.com"
    )


@pytest.mark.asyncio
async def test_a_walk_in_has_no_variant_and_matches_nothing(
    db_async: AsyncSession,
) -> None:
    org = await _org(db_async)
    walk_in = await service.create_without_email(
        db_async, org, name="Walk In", source="bookings"
    )
    assert walk_in.email_variant_hash is None
    assert not await service.is_known_address(db_async, org, _address("walk"))


@pytest.mark.asyncio
async def test_the_known_check_is_per_organisation(db_async: AsyncSession) -> None:
    org_a = await _org(db_async)
    org_b = await _org(db_async)
    stem = uuid.uuid4().hex[:8]
    await service.upsert_contact(
        db_async, org_a, email=f"victim{stem}@gmail.com", source="bookings"
    )
    assert await service.is_known_address(db_async, org_a, f"vic.tim{stem}@gmail.com")
    assert not await service.is_known_address(
        db_async, org_b, f"vic.tim{stem}@gmail.com"
    )


@pytest.mark.asyncio
async def test_merge_that_inherits_an_address_carries_its_variant_hash(
    db_async: AsyncSession,
) -> None:
    owner = await _owner(db_async)
    org = await _org(db_async)
    stem = uuid.uuid4().hex[:8]
    walk_in = await service.create_without_email(
        db_async, org, name="Walk In", source="bookings"
    )
    with_address = await service.upsert_contact(
        db_async, org, email=f"vic.tim{stem}@gmail.com", source="bookings"
    )
    kept = await service.merge_contacts(
        db_async, owner, walk_in.id, with_address.id, organisation_id=org
    )
    assert kept.email_hash == hash_email(f"vic.tim{stem}@gmail.com")
    assert kept.email_variant_hash == hash_email_variant(f"victim{stem}@gmail.com")
    assert await service.is_known_address(db_async, org, f"victim{stem}+x@gmail.com")
