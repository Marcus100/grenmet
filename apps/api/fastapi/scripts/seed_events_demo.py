"""Local demo data for Barrels Events (fictional organisers, groups and events).

Create-once and local-only: refuses to run unless ENVIRONMENT is "local" and
the organisers table is empty. Dates are relative to today so the demo stays
current. Usage: python scripts/seed_events_demo.py --apply
"""

from __future__ import annotations

import argparse
import os
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import psycopg

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


def seed(conn: psycopg.Connection[Any]) -> None:
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM organisers")
        row = cur.fetchone()
        if row and row[0]:
            print("events demo: organisers exist; nothing to do")
            return
        organiser_ids: dict[str, uuid.UUID] = {}
        for slug, name, bio, verified in ORGANISERS:
            organiser_ids[slug] = uuid.uuid4()
            cur.execute(
                "INSERT INTO organisers (id, slug, name, bio, verified) VALUES (%s, %s, %s, %s, %s)",
                (organiser_ids[slug], slug, name, bio, verified),
            )
        group_ids: dict[str, uuid.UUID] = {}
        for slug, name, tagline, category, parish, policy in GROUPS:
            group_ids[slug] = uuid.uuid4()
            cur.execute(
                "INSERT INTO groups (id, slug, name, tagline, category, parish, join_policy)"
                " VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (group_ids[slug], slug, name, tagline, category, parish, policy),
            )
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
            listing_id = uuid.uuid4()
            starts = at(day, start)
            cur.execute(
                "INSERT INTO listings (id, slug, title, summary, description, category, parish, venue,"
                " starts_at, ends_at, admission, capacity, organiser_id, group_id, featured, tags, status)"
                " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'published')",
                (
                    listing_id,
                    slug,
                    title,
                    summary,
                    summary,
                    category,
                    parish,
                    venue,
                    starts,
                    starts + timedelta(hours=hours),
                    admission,
                    500,
                    organiser_ids[organiser],
                    group_ids.get(group) if group else None,
                    featured,
                    tags,
                ),
            )
            if price is not None:
                cur.execute(
                    "INSERT INTO ticket_tiers (id, listing_id, name, price_minor, allocation)"
                    " VALUES (%s, %s, 'General', %s, 400)",
                    (uuid.uuid4(), listing_id, price),
                )
    print(
        f"events demo: {len(ORGANISERS)} organisers, {len(GROUPS)} groups, {len(LISTINGS)} listings"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the demo rows")
    args = parser.parse_args()
    if os.environ.get("ENVIRONMENT", "local") != "local":
        raise SystemExit("Refusing to seed Barrels Events demo data outside local")
    url = os.environ.get("EVENTS_DATABASE_URL")
    if not url:
        raise SystemExit("EVENTS_DATABASE_URL is required")
    if not args.apply:
        print(f"events demo preview: {len(LISTINGS)} listings (pass --apply to write)")
        return
    with psycopg.connect(url.replace("postgresql+asyncpg://", "postgresql://")) as conn:
        seed(conn)


if __name__ == "__main__":
    main()
