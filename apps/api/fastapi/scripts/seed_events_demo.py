"""Local demo data for Barrels Events (fictional organisers, groups and events).

Organisers are created through the Events service (linked to platform
organisations, owned by an existing account). Create-once and local-only: refuses to run unless ENVIRONMENT is "local" and
the organisers table is empty. Dates are relative to today so the demo stays
current. Usage: python scripts/seed_events_demo.py --apply
"""

from __future__ import annotations

import argparse
import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta

GRENADA_OFFSET = timedelta(hours=-4)

ORGANISERS = [
    (
        "feel-free-promotions",
        "Feel Free Promotions",
        "All-inclusive fetes and sunset parties.",
        True,
    ),
    (
        "spice-isle-tech",
        "Spice Isle Tech Collective",
        "Monthly meetups for builders in Grenada.",
        True,
    ),
    (
        "anse-runners",
        "Anse Runners",
        "A free community run club. All paces welcome.",
        False,
    ),
    (
        "nutmeg-kitchen-collective",
        "Nutmeg Kitchen Collective",
        "Pop-up dinners and food markets.",
        True,
    ),
]
GROUPS = [
    (
        "spice-isle-tech",
        "Spice Isle Tech",
        "Developers, designers and founders.",
        "tech",
        "st-george",
        "open",
    ),
    (
        "anse-runners",
        "Anse Runners",
        "5K along Grand Anse, then coconut water.",
        "sport",
        "st-george",
        "open",
    ),
    (
        "women-in-business-gnd",
        "Women in Business GND",
        "Peer support for women founders.",
        "business",
        "st-george",
        "approval",
    ),
]
# slug, title, summary, category, parish, venue, day offset, start, hours, admission,
# organiser slug, group slug, price (minor) or None, tags, featured
LISTINGS = [
    (
        "feel-free-sunset",
        "Feel Free: Sunset",
        "All-inclusive sunset fete with a live band.",
        "fete",
        "st-george",
        "National Stadium grounds",
        0,
        "16:00",
        8,
        "ticketed",
        "feel-free-promotions",
        None,
        15000,
        ["spicemas"],
        True,
    ),
    (
        "spice-isle-tech-monthly",
        "Spice Isle Tech: Building for the ECCU",
        "Talks on payments and demos from local builders.",
        "tech",
        "st-george",
        "Port Louis co-working loft",
        5,
        "18:00",
        2.5,
        "rsvp",
        "spice-isle-tech",
        "spice-isle-tech",
        None,
        [],
        True,
    ),
    (
        "anse-runners-tuesday",
        "Tuesday 5K",
        "After-work community run. All paces.",
        "sport",
        "st-george",
        "Morne Rouge car park",
        3,
        "17:30",
        1.25,
        "free",
        "anse-runners",
        "anse-runners",
        None,
        [],
        False,
    ),
    (
        "nutmeg-night-market",
        "Nutmeg Night Market",
        "Street food, craft stalls and a steel pan side.",
        "food",
        "st-george",
        "Carenage waterfront",
        6,
        "17:00",
        5,
        "free",
        "nutmeg-kitchen-collective",
        None,
        None,
        ["spicemas"],
        False,
    ),
    (
        "supper-club-oil-down",
        "Supper Club: Oil Down Night",
        "A long-table dinner with strangers.",
        "food",
        "st-david",
        "La Sagesse estate house",
        1,
        "18:30",
        3.5,
        "ticketed",
        "nutmeg-kitchen-collective",
        None,
        12000,
        [],
        True,
    ),
]


def at(day: int, time: str) -> datetime:
    """Grenada wall-clock time ``day`` days from today, as naive UTC."""
    local_today = (datetime.now(UTC) + GRENADA_OFFSET).date()
    hour, minute = (int(part) for part in time.split(":"))
    local = datetime(
        local_today.year, local_today.month, local_today.day, hour, minute
    ) + timedelta(days=day)
    return local - GRENADA_OFFSET


async def seed(owner_email: str) -> None:
    """Organisers go through ``service.create_organiser`` (platform organisation plus
    owner membership); groups, listings and tiers are plain Events rows."""
    from sqlalchemy import func, select

    from src.auth.models import User
    from src.database import async_session_factory
    from src.events import service
    from src.events.models import Group, Listing, Organiser, TicketTier

    async with async_session_factory() as events:
        owner = await events.scalar(select(User).where(User.email == owner_email))
        if owner is None:
            print(f"events demo: no account {owner_email}; skipping")
            return
        if await events.scalar(select(func.count()).select_from(Organiser)):
            print("events demo: organisers exist; nothing to do")
            return
        organisers: dict[str, Organiser] = {}
        for slug, name, bio, verified in ORGANISERS:
            organiser = await service.create_organiser(
                events, owner, name=name, slug=slug, bio=bio
            )
            organiser.verified = verified
            organisers[slug] = organiser
        await events.commit()
        groups: dict[str, Group] = {}
        for slug, name, tagline, category, parish, policy in GROUPS:
            groups[slug] = Group(
                slug=slug,
                name=name,
                tagline=tagline,
                category=category,
                parish=parish,
                join_policy=policy,
            )
        events.add_all(groups.values())
        await events.flush()
        for (
            slug,
            title,
            summary,
            category,
            parish,
            venue,
            day,
            start,
            hours,
            admission,
            organiser,
            group,
            price,
            tags,
            featured,
        ) in LISTINGS:
            starts = at(day, start)
            listing = Listing(
                id=uuid.uuid4(),
                slug=slug,
                title=title,
                summary=summary,
                description=summary,
                category=category,
                parish=parish,
                venue=venue,
                starts_at=starts,
                ends_at=starts + timedelta(hours=hours),
                admission=admission,
                capacity=500,
                organiser_id=organisers[organiser].id,
                group_id=groups[group].id if group else None,
                featured=featured,
                tags=tags,
                status="published",
            )
            events.add(listing)
            await events.flush()
            if price is not None:
                events.add(
                    TicketTier(
                        listing_id=listing.id,
                        name="General",
                        price_minor=price,
                        allocation=400,
                    )
                )
        await events.commit()
    print(
        f"events demo: {len(ORGANISERS)} organisers, {len(GROUPS)} groups, {len(LISTINGS)} listings"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the demo rows")
    parser.add_argument(
        "--owner-email",
        help="existing account that owns the demo organisers (default: first superuser)",
    )
    args = parser.parse_args()
    if os.environ.get("ENVIRONMENT", "local") != "local":
        raise SystemExit("Refusing to seed Barrels Events demo data outside local")
    if not args.apply:
        print(f"events demo preview: {len(LISTINGS)} listings (pass --apply to write)")
        return
    from src.config import settings

    asyncio.run(seed(args.owner_email or settings.FIRST_SUPERUSER))


if __name__ == "__main__":
    main()
