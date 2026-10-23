"""Catalogue taxonomy API (ADR-0046): tree, filters, classification rules."""

from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.events.models import Category, Group, Listing, Organiser, OrganiserMember
from src.events.urls import normalise_https_url, vendor_host
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.events.support import (
    BASE,
    SessionFactory,
    client_as,
    client_with_real_roles,
    seed,
)

MANAGE = f"{BASE}/manage/listings"


def _payload(**changes: Any) -> dict[str, Any]:
    start = (utc_now() + timedelta(days=10)).replace(microsecond=0)
    body: dict[str, Any] = {
        "title": "Harbour Lights Fete",
        "summary": "Lantern night on the water",
        "category": "fete",
        "parish": "st-george",
        "venue": "Carenage",
        "starts_at": f"{start.isoformat()}Z",
        "ends_at": f"{(start + timedelta(hours=5)).isoformat()}Z",
        "admission": "free",
        "capacity": 300,
        "status": "published",
    }
    body.update(changes)
    return body


async def _organiser(factory: SessionFactory, db_async: AsyncSession):
    user = await user_with_role(db_async, "events-organiser")
    async with factory() as db:
        organiser = Organiser(slug="harbour-crew", name="Harbour Crew", verified=True)
        db.add(organiser)
        await db.flush()
        db.add(OrganiserMember(organiser_id=organiser.id, user_id=user.id))
        await db.commit()
    return user


async def _post(user, **changes: Any):
    async with client_with_real_roles(user) as client:
        return await client.post(MANAGE, json=_payload(**changes))


async def _public(path: str, **params: Any):
    async with client_as(None) as client:
        return await client.get(f"{BASE}{path}", params=params)


@pytest.mark.asyncio
async def test_existing_listings_default_to_the_free_event_classification(
    events_db: SessionFactory,
):
    await seed(events_db)
    cards = (await _public("/listings")).json()["data"]
    by_slug = {card["slug"]: card for card in cards}
    assert by_slug["tech-meetup"]["booking_mode"] == "rsvp"
    assert by_slug["sunset-fete"]["booking_mode"] == "tickets"
    for card in cards:
        assert card["listing_type"] == "event"
        assert card["access_type"] == "public"
        assert card["external_ticket_url"] is None
        assert card["category_slug"] is None
    assert {"category", "admission"} <= set(cards[0])  # legacy fields intact


@pytest.mark.asyncio
async def test_category_tree_has_seed_children_and_counts(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    for kwargs in (
        {"category_slug": "parties-fetes", "subcategory_slug": "boat-fete"},
        {"category_slug": "parties-fetes"},
        {"category_slug": "music-live-shows", "status": "draft"},
    ):
        assert (await _post(organiser, **kwargs)).status_code == 201
    tree = (await _public("/public/categories")).json()["data"]
    slugs = [node["slug"] for node in tree]
    assert slugs[0] == "parties-fetes"
    assert len(slugs) == 9 and "wellness" not in slugs  # inactive is hidden
    parties = tree[0]
    assert parties["listing_count"] == 2
    boat = next(c for c in parties["children"] if c["slug"] == "boat-fete")
    assert boat["listing_count"] == 1
    assert len(parties["children"]) == 9
    assert tree[1]["listing_count"] == 0  # draft not counted
    assert parties["applies_to"] == ["event"]


@pytest.mark.asyncio
async def test_private_and_unlisted_listings_are_not_counted_or_listed(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    created = await _post(
        organiser, category_slug="parties-fetes", access_type="private"
    )
    assert created.status_code == 201
    body = created.json()
    assert body["access_type"] == "private"
    # Coerced: a private listing never appears in discovery.
    assert body["visibility"] == "unlisted"
    assert (await _public("/listings")).json()["count"] == 0
    assert (await _public("/public/categories")).json()["data"][0]["listing_count"] == 0
    # ...but opens by its link.
    assert (await _public(f"/listings/{body['slug']}")).status_code == 200
    # Going back to public access with a public visibility works.
    async with client_with_real_roles(organiser) as client:
        updated = await client.put(
            f"{MANAGE}/{body['id']}",
            json=_payload(access_type="public", visibility="public"),
        )
    assert updated.json()["visibility"] == "public"


@pytest.mark.asyncio
async def test_filters_select_by_each_dimension(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    await _post(
        organiser,
        title="Boat Fete One",
        category_slug="parties-fetes",
        subcategory_slug="boat-fete",
    )
    async with events_db() as db:  # staff curation sets external links, not organisers
        boat = await db.scalar(select(Listing).where(Listing.title == "Boat Fete One"))
        assert boat is not None
        boat.pricing_type = "paid"
        boat.booking_mode = "external"
        boat.external_ticket_url = "https://tickets.example/boat"
        await db.commit()
    await _post(
        organiser,
        title="Snorkel Morning",
        listing_type="experience",
        category_slug="tours-outdoors",
        subcategory_slug="snorkel-dive",
        admission="ticketed",
        tiers=[{"name": "Seat", "price_minor": 9000, "allocation": 10}],
        capacity=10,
    )
    await _post(
        organiser,
        title="Beach Jam",
        category_slug="music-live-shows",
        pricing_type="donation",
    )

    async def titles(**params: Any) -> set[str]:
        data = (await _public("/listings", **params)).json()["data"]
        return {card["title"] for card in data}

    assert await titles(type="experience") == {"Snorkel Morning"}
    assert await titles(type="event") == {"Boat Fete One", "Beach Jam"}
    assert await titles(category_slug="parties-fetes") == {"Boat Fete One"}
    assert await titles(subcategory_slug="snorkel-dive") == {"Snorkel Morning"}
    assert await titles(category_slug="tours-outdoors", pricing="paid") == {
        "Snorkel Morning"
    }
    assert await titles(pricing="donation") == {"Beach Jam"}
    assert await titles(pricing="paid") == {"Boat Fete One", "Snorkel Morning"}
    assert await titles(booking_mode="external") == {"Boat Fete One"}
    assert await titles(booking_mode="tickets") == {"Snorkel Morning"}
    assert await titles(access="public") == {
        "Boat Fete One",
        "Snorkel Morning",
        "Beach Jam",
    }
    assert (await _public("/listings", access="private")).status_code == 422
    assert await titles(category_slug="no-such") == set()
    card = (await _public("/listings", booking_mode="external")).json()["data"][0]
    assert card["external_ticket_url"] == "https://tickets.example/boat"
    assert card["subcategory_slug"] == "boat-fete"
    assert card["category_slug"] == "parties-fetes"
    assert card["pricing_type"] == "paid"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("changes", "detail"),
    [
        ({"listing_type": "service"}, "Service listings"),
        (
            {"listing_type": "experience", "category_slug": "parties-fetes"},
            "doesn't apply to experience",
        ),
        (
            {"category_slug": "parties-fetes", "subcategory_slug": "pan"},
            "doesn't belong to category",
        ),
        ({"category_slug": "boat-fete"}, "is a subcategory"),
        ({"subcategory_slug": "parties-fetes"}, "is a category"),
        ({"category_slug": "wellness"}, "isn't available"),
        ({"category_slug": "nope"}, "Unknown category"),
        ({"booking_mode": "tickets"}, "doesn't fit admission"),
        ({"admission": "rsvp", "booking_mode": "none"}, "doesn't fit admission"),
        ({"pricing_type": "paid"}, "Paid listings need"),
    ],
)
async def test_classification_rules_are_enforced(
    events_db: SessionFactory, db_async: AsyncSession, changes, detail
):
    organiser = await _organiser(events_db, db_async)
    response = await _post(organiser, **changes)
    assert response.status_code == 409, response.text
    assert detail in response.text
    async with events_db() as db:
        assert (await db.scalars(select(Listing))).first() is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "changes",
    [
        {"booking_mode": "external", "external_ticket_url": "http://x.example/t"},
        {"booking_mode": "external", "external_ticket_url": "javascript:alert(1)"},
        {"booking_mode": "slots"},
        {"booking_mode": "bogus"},
    ],
)
async def test_invalid_shapes_are_unprocessable(
    events_db: SessionFactory, db_async: AsyncSession, changes
):
    organiser = await _organiser(events_db, db_async)
    assert (await _post(organiser, **changes)).status_code == 422


@pytest.mark.asyncio
async def test_slots_is_reserved_in_the_message(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    assert "reserved" in (await _post(organiser, booking_mode="slots")).text


@pytest.mark.asyncio
async def test_price_tiers_force_paid_pricing(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    tiers = [{"name": "GA", "price_minor": 5000, "allocation": 10}]
    derived = await _post(organiser, admission="ticketed", tiers=tiers, capacity=10)
    assert derived.json()["pricing_type"] == "paid"
    assert derived.json()["booking_mode"] == "tickets"
    clash = await _post(
        organiser,
        admission="ticketed",
        tiers=tiers,
        capacity=10,
        pricing_type="free",
    )
    assert clash.status_code == 409


@pytest.mark.asyncio
async def test_updates_keep_classification_unless_changed(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    created = (
        await _post(
            organiser,
            category_slug="parties-fetes",
            subcategory_slug="boat-fete",
        )
    ).json()
    async with events_db() as db:
        listing = await db.scalar(select(Listing))
        assert listing is not None
        listing.pricing_type = "paid"
        listing.booking_mode = "external"
        listing.external_ticket_url = "https://t.example/a"
        await db.commit()
    async with client_with_real_roles(organiser) as client:
        same = (
            await client.put(
                f"{MANAGE}/{created['id']}", json=_payload(title="Renamed")
            )
        ).json()
        assert same["subcategory_slug"] == "boat-fete"
        assert same["booking_mode"] == "external"
        assert same["external_ticket_url"] == "https://t.example/a"
        assert same["pricing_type"] == "paid"
        moved = (
            await client.put(
                f"{MANAGE}/{created['id']}",
                json=_payload(booking_mode="none"),
            )
        ).json()
        assert moved["external_ticket_url"] is None
        wrong_type = await client.put(
            f"{MANAGE}/{created['id']}", json=_payload(listing_type="experience")
        )
        assert wrong_type.status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "changes",
    [
        {"booking_mode": "external"},
        {"booking_mode": "external", "external_ticket_url": "https://ok.example/t"},
        {"external_ticket_url": "https://ok.example/t"},
    ],
)
async def test_organisers_cannot_set_external_booking(
    events_db: SessionFactory, db_async: AsyncSession, changes
):
    organiser = await _organiser(events_db, db_async)
    response = await _post(organiser, **changes)
    assert response.status_code == 422
    assert "Barrels staff" in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "link",
    [
        "https://good.gd@evil.com",
        "https:///evil.com",
        "https://evil.com\u202e/x",
        "https://evil.com/\u0000",
        "https://evil.com/\n",
        "https://exämple.com/",
        "http://evil.com/",
    ],
)
async def test_bad_links_are_422_not_500(
    events_db: SessionFactory, db_async: AsyncSession, link
):
    organiser = await _organiser(events_db, db_async)
    response = await _post(organiser, booking_mode="external", external_ticket_url=link)
    assert response.status_code == 422


def test_link_normalisation_and_vendor_host():
    assert normalise_https_url("HTTPS://Tickets.Example.COM:8443/a?b=1#c") == (
        "https://tickets.example.com:8443/a?b=1#c"
    )
    assert normalise_https_url("https://xn--bcher-kva.example") == (
        "https://xn--bcher-kva.example/"
    )
    assert vendor_host("https://Tickets.Example.com/x") == "tickets.example.com"
    assert vendor_host(None) is None
    for bad in (
        "https://good.gd@evil.com",
        "https:///evil.com",
        "https://evil.com/\u202e",
        "https://evil.com/\u0000",
        "https://evil.com/\n",
        "https://exämple.com",
        "https://a.example:99999999/",
        "ftp://a.example",
        "",
    ):
        with pytest.raises(ValueError):
            normalise_https_url(bad)


@pytest.mark.asyncio
async def test_database_still_enforces_the_external_and_curated_rules(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    await _post(organiser)
    async with events_db() as db:
        listing = await db.scalar(select(Listing))
        assert listing is not None
        listing.external_ticket_url = "https://x.example/"  # not external mode
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()
        listing = await db.scalar(select(Listing))
        assert listing is not None
        listing.access_type = "private"
        listing.visibility = "unlisted"
        listing.curated = True
        with pytest.raises(IntegrityError):
            await db.commit()


@pytest.mark.asyncio
async def test_search_treats_percent_and_underscore_literally(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    await _post(organiser, title="100% Soca Night")
    await _post(organiser, title="Plain Fete")
    await _post(organiser, title="Under_score Jam")
    assert {c["title"] for c in (await _public("/listings", q="%")).json()["data"]} == {
        "100% Soca Night"
    }
    assert {c["title"] for c in (await _public("/listings", q="_")).json()["data"]} == {
        "Under_score Jam"
    }
    assert (await _public("/listings", q="Plain")).json()["count"] == 1


@pytest.mark.asyncio
async def test_group_next_event_ignores_unlisted_and_private_listings(
    events_db: SessionFactory,
):
    await seed(events_db)
    async with events_db() as db:
        group_id = await db.scalar(select(Group.id))
        template = await db.scalar(select(Listing).where(Listing.slug == "sunset-fete"))
        assert template is not None
        soon = utc_now() + timedelta(hours=3)
        for slug, visibility, access in (
            ("hidden-unlisted", "unlisted", "public"),
            ("hidden-private", "unlisted", "private"),
        ):
            db.add(
                Listing(
                    slug=slug,
                    title=slug,
                    summary="x",
                    category="fete",
                    parish="st-george",
                    venue="V",
                    starts_at=soon,
                    ends_at=soon + timedelta(hours=1),
                    admission="free",
                    organiser_id=template.organiser_id,
                    group_id=group_id,
                    status="published",
                    visibility=visibility,
                    access_type=access,
                )
            )
        visible = utc_now() + timedelta(days=5)
        db.add(
            Listing(
                slug="shown",
                title="shown",
                summary="x",
                category="fete",
                parish="st-george",
                venue="V",
                starts_at=visible,
                ends_at=visible + timedelta(hours=1),
                admission="free",
                organiser_id=template.organiser_id,
                group_id=group_id,
                status="published",
            )
        )
        await db.commit()
    groups = (await _public("/groups")).json()
    group = next(g for g in groups if g["slug"] == "anse-runners")
    assert group["next_listing_starts_at"].startswith(visible.date().isoformat())


@pytest.mark.asyncio
async def test_seed_survives_cleanup_and_is_two_levels(events_db: SessionFactory):
    async with events_db() as db:
        rows = (await db.scalars(select(Category))).all()
    parents = {row.id for row in rows if row.parent_id is None}
    assert len(parents) == 10
    assert all(row.parent_id in parents for row in rows if row.parent_id)
