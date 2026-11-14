"""A signed-in booking links its organisation contact to the account (ADR-0058 slice 1).

Linking needs the account's VERIFIED email to equal the booking email. Name and
phone never link, and an existing link to another account is never changed.
``GET /bookings/me/bookings`` lists the caller's own bookings across organisations.
"""

import uuid
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.auth import service as auth_service
from src.auth.models import User
from src.auth.schemas import UserUpdateMe
from src.bookings import public
from src.bookings.models import Booking, BookingStatus
from src.contacts import service as contacts_service
from src.contacts.models import Contact
from src.outbox import Outbox
from src.rewards import outbox_handlers as rewards_handlers
from src.rewards import service as rewards_service
from src.rewards.models import Entry
from src.rewards.schemas import ProgramCreate
from src.utils.datetime import utc_now
from src.utils.email_hash import hash_email
from tests.bookings.booking_day import MONDAY, utc_at
from tests.bookings.test_public_bookings import API, Studio, _body, _slots, _studio
from tests.factories import make_user
from tests.organisations.support import headers_for

FULL = ("bookings", "contacts", "rewards")
ROW_KEYS = {
    "id",
    "status",
    "starts_at",
    "ends_at",
    "service_name",
    "business_name",
    "business_slug",
}


async def _signed_in_book(
    client: httpx.AsyncClient,
    studio: Studio,
    account_headers: dict[str, str],
    *,
    slot: int = 0,
    **overrides: object,
) -> httpx.Response:
    slots = await _slots(client, studio)
    return await client.post(
        f"{API}/public/{studio.slug}/bookings",
        headers={**account_headers, "Idempotency-Key": uuid.uuid4().hex},
        json=_body(studio, slots[slot], **overrides),
    )


async def _contact_for(db: AsyncSession, org_id: str, email: str) -> Contact:
    """The contact as the API left it. Reloads only the contact row: expiring the
    whole session would make the test's user objects lazy-load outside the greenlet."""
    contact = await db.scalar(
        select(Contact)
        .where(
            Contact.organisation_id == org_id,
            Contact.email_hash == hash_email(email),
        )
        .execution_options(populate_existing=True)
    )
    assert contact is not None
    return contact


async def test_a_verified_account_with_the_booking_email_is_linked(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    account = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    # The booking types the address in another case: the match ignores case.
    resp = await _signed_in_book(
        async_client,
        studio,
        headers_for(account),
        customer_email=account.email.upper(),
    )
    assert resp.status_code == 201, resp.text
    contact = await _contact_for(db_async, studio.org_id, account.email)
    assert contact.user_id == account.id


async def test_an_unverified_account_email_does_not_link(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    account = await make_user(
        db_async, email=f"unv-{uuid.uuid4().hex[:6]}@example.com", verified=False
    )
    resp = await _signed_in_book(
        async_client, studio, headers_for(account), customer_email=account.email
    )
    assert resp.status_code == 201, resp.text
    contact = await _contact_for(db_async, studio.org_id, account.email)
    assert contact.user_id is None


async def test_a_different_email_with_the_same_name_and_phone_does_not_link(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    account = await make_user(
        db_async, email=f"mine-{uuid.uuid4().hex[:6]}@example.com"
    )
    other = f"other-{uuid.uuid4().hex[:6]}@example.com"
    resp = await _signed_in_book(
        async_client,
        studio,
        headers_for(account),
        customer_email=other,
        customer_name="Test User",
        customer_phone="+1 473 555 0199",
    )
    assert resp.status_code == 201, resp.text
    contact = await _contact_for(db_async, studio.org_id, other)
    assert contact.user_id is None


async def test_a_contact_linked_to_another_account_is_not_relinked(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    email = f"shared-{uuid.uuid4().hex[:6]}@example.com"
    first = await make_user(db_async, email=email)
    contact = await contacts_service.upsert_contact(
        db_async, studio.org_id, email=email, source="bookings"
    )
    first_id = first.id
    contact.user_id = first_id
    # `first` later moves to another address, so the email is free for `second`.
    first.email = f"moved-{uuid.uuid4().hex[:6]}@example.com"
    await db_async.commit()
    second = await make_user(db_async, email=email)

    resp = await _signed_in_book(
        async_client, studio, headers_for(second), customer_email=email
    )
    assert resp.status_code == 201, resp.text
    contact = await _contact_for(db_async, studio.org_id, email)
    assert contact.user_id == first_id


async def _book_in(
    client: httpx.AsyncClient, studio: Studio, account: User, slot: int
) -> str:
    """A booking by ``account`` under its own verified address."""
    resp = await _signed_in_book(
        client,
        studio,
        headers_for(account),
        slot=slot,
        customer_email=account.email,
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["booking"]["id"])


async def _move_to_past(db: AsyncSession, booking_id: str) -> None:
    booking = await db.get(Booking, uuid.UUID(booking_id))
    assert booking is not None
    start = utc_at(9, day=MONDAY - timedelta(days=28))
    booking.starts_at = start
    booking.ends_at = start + timedelta(hours=2)
    booking.blocked_from = start
    booking.blocked_until = booking.ends_at
    await db.commit()


async def test_me_bookings_lists_only_the_callers_bookings_newest_first(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # One provider per studio fits two 2-hour bookings a day, so each person
    # books in a studio of their own to keep the slots free.
    first_studio = await _studio(db_async, async_client)
    second_studio = await _studio(db_async, async_client)
    third_studio = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    bob = await make_user(db_async, email=f"bob-{uuid.uuid4().hex[:6]}@example.com")
    ada_headers = headers_for(ada)

    early = await _book_in(async_client, first_studio, ada, slot=0)
    late = await _book_in(async_client, first_studio, ada, slot=-1)
    elsewhere = await _book_in(async_client, second_studio, ada, slot=0)
    bobs = await _book_in(async_client, second_studio, bob, slot=-1)
    guest = await async_client.post(
        f"{API}/public/{third_studio.slug}/bookings",
        headers={"Idempotency-Key": uuid.uuid4().hex},
        json=_body(third_studio, (await _slots(async_client, third_studio))[0]),
    )
    assert guest.status_code == 201, guest.text
    guest_id = str(guest.json()["booking"]["id"])

    page1 = await async_client.get(
        f"{API}/me/bookings", headers=ada_headers, params={"page": 1, "size": 2}
    )
    assert page1.status_code == 200, page1.text
    body = page1.json()
    assert body["count"] == 3
    assert body["page"] == 1 and body["size"] == 2
    assert len(body["data"]) == 2
    assert set(body["data"][0]) == ROW_KEYS
    starts = [row["starts_at"] for row in body["data"]]
    assert starts == sorted(starts, reverse=True)
    # The latest slot of the first studio is newer than its earliest one.
    assert body["data"][0]["id"] == late

    page2 = await async_client.get(
        f"{API}/me/bookings", headers=ada_headers, params={"page": 2, "size": 2}
    )
    assert page2.status_code == 200, page2.text
    seen = {row["id"] for row in body["data"]} | {
        row["id"] for row in page2.json()["data"]
    }
    assert seen == {late, early, elsewhere}
    assert bobs not in seen and guest_id not in seen

    row = body["data"][0]
    assert row["business_name"] == "Babydoll Beauty Bar"
    assert row["business_slug"] == first_studio.slug
    assert row["service_name"] == "Classic full set"


async def test_me_bookings_upcoming_filter_splits_past_and_future(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    headers = headers_for(ada)
    past = await _book_in(async_client, studio, ada, slot=0)
    await _move_to_past(db_async, past)
    await db_async.refresh(ada)  # the commit above expired the user
    future = await _book_in(async_client, studio, ada, slot=0)

    def ids(resp: httpx.Response) -> set[str]:
        assert resp.status_code == 200, resp.text
        return {row["id"] for row in resp.json()["data"]}

    everything = await async_client.get(f"{API}/me/bookings", headers=headers)
    assert ids(everything) == {past, future}
    upcoming = await async_client.get(
        f"{API}/me/bookings", headers=headers, params={"upcoming": "true"}
    )
    assert ids(upcoming) == {future}
    history = await async_client.get(
        f"{API}/me/bookings", headers=headers, params={"upcoming": "false"}
    )
    assert ids(history) == {past}


async def test_me_bookings_needs_a_signed_in_account(
    async_client: httpx.AsyncClient,
) -> None:
    resp = await async_client.get(f"{API}/me/bookings")
    assert resp.status_code == 401


async def test_a_completed_linked_booking_queues_the_reward_action(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, apps=FULL)
    actor = await make_user(db_async)
    await rewards_service.create_program(
        db_async,
        organisation_id=studio.org_id,
        actor=actor,
        payload=ProgramCreate(
            name="Lash card",
            stamps_required=3,
            reward_description="A free fill",
            qualifying_source_type="bookings.completed",
        ),
    )
    account = await make_user(db_async, email=f"rew-{uuid.uuid4().hex[:6]}@example.com")
    account_id = account.id
    booking_id = await _book_in(async_client, studio, account, slot=0)

    booking = await db_async.get(Booking, uuid.UUID(booking_id))
    assert booking is not None
    await public.transition(db_async, booking, BookingStatus.COMPLETED)
    await db_async.commit()

    key = f"bookings.completed:{booking_id}:{account_id}"
    rows = (
        await db_async.scalars(
            select(Outbox).where(
                Outbox.topic == rewards_handlers.TOPIC, Outbox.dedupe_key == key
            )
        )
    ).all()
    assert len(rows) == 1
    assert await outbox.drain(db_async, only_topics={rewards_handlers.TOPIC}) >= 1
    entries = (
        await db_async.scalars(select(Entry).where(Entry.account_id == account_id))
    ).all()
    assert [(e.source_type, e.source_id) for e in entries] == [
        ("bookings.completed", booking_id)
    ]


async def test_unlinking_the_contact_hides_the_bookings(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # The list follows contact.user_id, so an unlinked contact shows nothing.
    studio = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    ada_id, headers = ada.id, headers_for(ada)
    await _book_in(async_client, studio, ada, slot=0)
    contact = await _contact_for(db_async, studio.org_id, ada.email)
    assert contact.user_id == ada_id
    contact.user_id = None
    await db_async.commit()
    resp = await async_client.get(f"{API}/me/bookings", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["count"] == 0


async def test_business_staff_never_see_the_account_uuid(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # The Barrels account UUID is one identity shared by every business it books
    # with, so the organisation's contact responses leave it out (ADR-0058).
    studio = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    await _book_in(async_client, studio, ada, slot=0)
    contact = await _contact_for(db_async, studio.org_id, ada.email)
    contact_id = contact.id
    assert contact.user_id is not None  # linked, so the hiding is what is tested

    detail = await async_client.get(
        f"/api/v1/contacts/org/contacts/{contact_id}", headers=studio.headers
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["user_id"] is None
    listing = await async_client.get(
        "/api/v1/contacts/org/contacts", headers=studio.headers
    )
    assert listing.status_code == 200, listing.text
    assert {row["user_id"] for row in listing.json()["data"]} == {None}


async def test_the_organisation_audit_history_never_names_the_account(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # The audit rows of a linked booking exist, and none carries the account id
    # or its address, as actor or as a changed value (ADR-0058).
    studio = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"audit-{uuid.uuid4().hex[:6]}@example.com")
    ada_id, ada_email = ada.id, ada.email
    await _book_in(async_client, studio, ada, slot=0)
    history = await async_client.get(
        f"/api/v1/audit/platform_organisation/{studio.org_id}", headers=studio.headers
    )
    assert history.status_code == 200, history.text
    text = history.text
    assert "link_account" in text
    assert str(ada_id) not in text
    assert ada_email not in text


async def test_an_email_change_drops_the_old_link_and_its_earnings(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, apps=FULL)
    actor = await make_user(db_async)
    await rewards_service.create_program(
        db_async,
        organisation_id=studio.org_id,
        actor=actor,
        payload=ProgramCreate(
            name="Lash card",
            stamps_required=3,
            reward_description="A free fill",
            qualifying_source_type="bookings.completed",
        ),
    )
    ada = await make_user(db_async, email=f"old-{uuid.uuid4().hex[:6]}@example.com")
    ada_id = ada.id
    old_booking = await _book_in(async_client, studio, ada, slot=0)
    assert (
        await async_client.get(f"{API}/me/bookings", headers=headers_for(ada))
    ).json()["count"] == 1

    await auth_service.update_user_me(
        session=db_async,
        current_user=ada,
        user_in=UserUpdateMe(email=f"new-{uuid.uuid4().hex[:6]}@example.com"),
    )
    await db_async.commit()
    db_async.expire_all()
    ada = await db_async.get(User, ada_id)
    assert ada is not None
    ada.email_verified_at = utc_now()  # verified again at the new address
    await db_async.commit()

    listed = await async_client.get(f"{API}/me/bookings", headers=headers_for(ada))
    assert listed.status_code == 200, listed.text
    assert listed.json()["count"] == 0

    booking = await db_async.get(Booking, uuid.UUID(old_booking))
    assert booking is not None
    await public.transition(db_async, booking, BookingStatus.COMPLETED)
    await db_async.commit()
    rows = (
        await db_async.scalars(
            select(Outbox).where(
                Outbox.topic == rewards_handlers.TOPIC,
                Outbox.dedupe_key == f"bookings.completed:{old_booking}:{ada_id}",
            )
        )
    ).all()
    assert rows == []


async def test_a_new_verified_address_links_a_new_contact(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"was-{uuid.uuid4().hex[:6]}@example.com")
    ada_id = ada.id
    await _book_in(async_client, studio, ada, slot=0)
    new_email = f"now-{uuid.uuid4().hex[:6]}@example.com"
    # The real email-change path: it unlinks the old contact.
    await auth_service.update_user_me(
        session=db_async, current_user=ada, user_in=UserUpdateMe(email=new_email)
    )
    await db_async.commit()
    ada = await db_async.get(User, ada_id)
    assert ada is not None
    ada.email_verified_at = utc_now()  # verified at the new address
    await db_async.commit()
    headers = headers_for(ada)
    await _book_in(async_client, studio, ada, slot=0)
    contact = await _contact_for(db_async, studio.org_id, new_email)
    assert contact.user_id == ada_id
    listed = await async_client.get(f"{API}/me/bookings", headers=headers)
    assert listed.json()["count"] == 1


async def test_deleting_the_account_unlinks_its_contacts(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"gone-{uuid.uuid4().hex[:6]}@example.com")
    ada_email = ada.email
    await _book_in(async_client, studio, ada, slot=0)
    await auth_service.delete_user(session=db_async, user=ada)
    contact = await _contact_for(db_async, studio.org_id, ada_email)
    assert contact.user_id is None


async def test_an_erased_contact_is_not_listed(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"erased-{uuid.uuid4().hex[:6]}@example.com")
    await _book_in(async_client, studio, ada, slot=0)
    contact = await _contact_for(db_async, studio.org_id, ada.email)
    await contacts_service.erase_contact(db_async, contact)
    await db_async.commit()
    listed = await async_client.get(f"{API}/me/bookings", headers=headers_for(ada))
    assert listed.json()["count"] == 0


async def test_an_erased_contact_is_never_linked(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    email = f"tomb-{uuid.uuid4().hex[:6]}@example.com"
    contact = await contacts_service.upsert_contact(
        db_async, studio.org_id, email=email, source="bookings"
    )
    await contacts_service.erase_contact(db_async, contact)
    account = await make_user(db_async, email=email)
    linked = await contacts_service.link_verified_account(
        db_async,
        contact,
        booking_email=email,
        user_id=account.id,
        account_email=email,
        account_email_verified=True,
    )
    assert linked is False
    assert contact.user_id is None


async def test_a_replayed_booking_does_not_relink_or_duplicate(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"rep-{uuid.uuid4().hex[:6]}@example.com")
    headers = {**headers_for(ada), "Idempotency-Key": uuid.uuid4().hex}
    slots = await _slots(async_client, studio)
    body = _body(studio, slots[0], customer_email=ada.email)
    first = await async_client.post(
        f"{API}/public/{studio.slug}/bookings", headers=headers, json=body
    )
    assert first.status_code == 201, first.text
    replay = await async_client.post(
        f"{API}/public/{studio.slug}/bookings", headers=headers, json=body
    )
    assert replay.status_code == 201, replay.text
    assert replay.headers.get("Idempotency-Replayed") == "true"
    assert replay.json()["booking"]["id"] == first.json()["booking"]["id"]
    listed = await async_client.get(f"{API}/me/bookings", headers=headers_for(ada))
    assert listed.json()["count"] == 1
    contact = await _contact_for(db_async, studio.org_id, ada.email)
    assert contact.user_id == ada.id


async def test_a_mixed_case_account_email_links_a_lowercase_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    mixed = f"Mixed.Case-{uuid.uuid4().hex[:6]}@Example.com"
    account = await make_user(db_async, email=mixed)
    resp = await _signed_in_book(
        async_client,
        studio,
        headers_for(account),
        customer_email=mixed.lower(),
    )
    assert resp.status_code == 201, resp.text
    contact = await _contact_for(db_async, studio.org_id, mixed)
    assert contact.user_id == account.id


async def test_one_account_lists_bookings_from_two_organisations(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    first = await _studio(db_async, async_client)
    second = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"two-{uuid.uuid4().hex[:6]}@example.com")
    await _book_in(async_client, first, ada, slot=0)
    await _book_in(async_client, second, ada, slot=0)
    listed = await async_client.get(f"{API}/me/bookings", headers=headers_for(ada))
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert body["count"] == 2
    assert {row["business_slug"] for row in body["data"]} == {first.slug, second.slug}


async def test_paging_walks_every_booking_exactly_once(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"page-{uuid.uuid4().hex[:6]}@example.com")
    ids = {await _book_in(async_client, studio, ada, slot=0)}
    ids.add(await _book_in(async_client, studio, ada, slot=-1))
    seen: list[str] = []
    for page in (1, 2, 3):
        resp = await async_client.get(
            f"{API}/me/bookings",
            headers=headers_for(ada),
            params={"page": page, "size": 1},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["count"] == 2
        seen.extend(row["id"] for row in resp.json()["data"])
    assert sorted(seen) == sorted(ids)


async def test_a_merge_keeps_the_account_link_and_its_bookings(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    guest_email = f"guest-{uuid.uuid4().hex[:6]}@example.com"
    guest = await async_client.post(
        f"{API}/public/{studio.slug}/bookings",
        headers={"Idempotency-Key": uuid.uuid4().hex},
        json=_body(
            studio, (await _slots(async_client, studio))[0], customer_email=guest_email
        ),
    )
    assert guest.status_code == 201, guest.text
    ada = await make_user(db_async, email=f"merge-{uuid.uuid4().hex[:6]}@example.com")
    ada_id, ada_email, ada_headers = ada.id, ada.email, headers_for(ada)
    await _book_in(async_client, studio, ada, slot=0)
    keep = await _contact_for(db_async, studio.org_id, guest_email)
    drop = await _contact_for(db_async, studio.org_id, ada_email)
    keep_id, drop_id = keep.id, drop.id
    admin = await make_user(db_async)
    await contacts_service.merge_contacts(
        db_async, admin, keep_id, drop_id, organisation_id=studio.org_id
    )
    await db_async.commit()
    db_async.expire_all()
    kept = await db_async.get(Contact, keep_id)
    assert kept is not None and kept.user_id == ada_id
    # Known behaviour (owner decision pending): merging the guest's record into the
    # linked one makes the guest's earlier booking appear in the account's list.
    listed = await async_client.get(f"{API}/me/bookings", headers=ada_headers)
    assert listed.json()["count"] == 2


async def _account_app_session(
    async_client: httpx.AsyncClient,
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    email: str,
) -> tuple[User, str]:
    """An account-app access token, minted through the single sign-on hand-off the
    account app uses (the same flow as the profile photo tests)."""
    from src.auth.config import auth_settings
    from src.auth.permissions import seed_permissions_and_roles_async
    from tests.auth.test_app_handoff import _account_session, _redeem, _start, _state

    await seed_permissions_and_roles_async(db)
    secret = "account-test-client-secret"
    monkeypatch.setattr(auth_settings, "ACCOUNT_SSO_CLIENT_SECRET", secret)
    base = "/api/v1/auth/apps/account"
    session_secret = await _account_session(db, email=email)
    state = _state()
    started = await _start(async_client, session_secret, state, join=True, base=base)
    assert started.status_code == 200, started.text
    redeemed = await _redeem(
        async_client, started.json()["code"], state, base=base, secret=secret
    )
    assert redeemed.status_code == 200, redeemed.text
    user = await db.scalar(select(User).where(User.email == email))
    assert user is not None
    return user, redeemed.json()["access_token"]


async def _move_to_day(db: AsyncSession, booking_id: str, days_before: int) -> None:
    booking = await db.get(Booking, uuid.UUID(booking_id))
    assert booking is not None
    start = utc_at(9, day=MONDAY - timedelta(days=days_before))
    booking.starts_at = start
    booking.ends_at = start + timedelta(hours=2)
    booking.blocked_from = start
    booking.blocked_until = booking.ends_at
    await db.commit()


async def test_the_account_app_session_lists_only_the_callers_bookings(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    studio = await _studio(db_async, async_client)
    other_studio = await _studio(db_async, async_client)
    email = f"app-{uuid.uuid4().hex[:6]}@example.com"
    user, token = await _account_app_session(async_client, db_async, monkeypatch, email)
    mine = {
        await _book_in(async_client, studio, user, slot=0),
        await _book_in(async_client, other_studio, user, slot=0),
    }
    stranger = await make_user(db_async)
    await _book_in(async_client, studio, stranger, slot=-1)

    resp = await async_client.get(
        f"{API}/me/bookings", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["count"] == 2
    assert {row["id"] for row in body["data"]} == mine


async def test_a_token_for_another_app_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    from datetime import timedelta as td

    from src.auth.utils import create_access_token

    user = await make_user(db_async)
    for app in ("bookings", "gms"):
        token = create_access_token(user.id, td(minutes=5), app=app)
        resp = await async_client.get(
            f"{API}/me/bookings", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 401, (app, resp.text)


async def test_a_full_account_token_still_lists(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"full-{uuid.uuid4().hex[:6]}@example.com")
    booking = await _book_in(async_client, studio, ada, slot=0)
    resp = await async_client.get(f"{API}/me/bookings", headers=headers_for(ada))
    assert resp.status_code == 200, resp.text
    assert [row["id"] for row in resp.json()["data"]] == [booking]


async def test_upcoming_lists_soonest_first_across_pages(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    first = await _studio(db_async, async_client)
    second = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"soon-{uuid.uuid4().hex[:6]}@example.com")
    ada_headers = headers_for(ada)
    late_here = await _book_in(async_client, first, ada, slot=-1)
    early_here = await _book_in(async_client, first, ada, slot=0)
    elsewhere = await _book_in(async_client, second, ada, slot=0)
    wanted = {late_here, early_here, elsewhere}
    seen: list[dict] = []
    for page in (1, 2, 3):
        resp = await async_client.get(
            f"{API}/me/bookings",
            headers=ada_headers,
            params={"upcoming": "true", "page": page, "size": 1},
        )
        assert resp.status_code == 200, resp.text
        seen.extend(resp.json()["data"])
    assert {row["id"] for row in seen} == wanted
    keys = [(row["starts_at"], row["id"]) for row in seen]
    assert keys == sorted(keys)
    assert seen[-1]["id"] == late_here


async def test_past_bookings_stay_newest_first(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"past-{uuid.uuid4().hex[:6]}@example.com")
    ada_headers = headers_for(ada)
    older = await _book_in(async_client, studio, ada, slot=0)
    newer = await _book_in(async_client, studio, ada, slot=0)
    await _move_to_day(db_async, older, days_before=35)
    await _move_to_day(db_async, newer, days_before=28)
    seen: list[str] = []
    for page in (1, 2):
        resp = await async_client.get(
            f"{API}/me/bookings",
            headers=ada_headers,
            params={"upcoming": "false", "page": page, "size": 1},
        )
        assert resp.status_code == 200, resp.text
        seen.extend(row["id"] for row in resp.json()["data"])
    assert seen == [newer, older]
