"""Rehearse the catalogue taxonomy migration (ADR-0046) in a rolled-back transaction."""

import os
import uuid

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from src.config import settings
from src.database import engine
from tests.database_target import require_owned_database

REVISION = "eventstaxonomy20261022"


@pytest.fixture
async def migration_at_head(db_async):
    await db_async.rollback()
    require_owned_database(settings.POSTGRES_DB, os.environ)
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    target = scripts.get_revision(REVISION)
    assert target is not None
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text("SET LOCAL lock_timeout = '5s'"))
            connection.execute(text("SET LOCAL statement_timeout = '30s'"))
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                yield connection, target.module
        finally:
            transaction.rollback()


def _listing(connection, organiser_id, category, admission, price=None, tags="{}"):
    listing_id = uuid.uuid4()
    connection.execute(
        text(
            "INSERT INTO events.listings (id, slug, title, category, parish, venue,"
            " starts_at, ends_at, admission, organiser_id, tags) VALUES (:id, :slug,"
            " 'T', :cat, 'st-george', 'V', now(), now() + interval '1 hour', :adm,"
            " :org, CAST(:tags AS text[]))"
        ),
        {
            "id": listing_id,
            "slug": f"l-{listing_id.hex[:10]}",
            "cat": category,
            "adm": admission,
            "org": organiser_id,
            "tags": tags,
        },
    )
    if price is not None:
        connection.execute(
            text(
                "INSERT INTO events.ticket_tiers (id, listing_id, name, price_minor,"
                " allocation) VALUES (gen_random_uuid(), :l, 'General', :p, 10)"
            ),
            {"l": listing_id, "p": price},
        )
    return listing_id


def _row(connection, listing_id):
    return connection.execute(
        text(
            "SELECT l.pricing_type, l.booking_mode, l.listing_type, l.access_type,"
            " l.curated, c.slug, s.slug, l.tags FROM events.listings l"
            " LEFT JOIN events.categories c ON c.id = l.category_id"
            " LEFT JOIN events.categories s ON s.id = l.subcategory_id"
            " WHERE l.id = :id"
        ),
        {"id": listing_id},
    ).one()


def test_seed_has_the_adopted_taxonomy(migration_at_head):
    connection, _ = migration_at_head
    tops = connection.execute(
        text(
            "SELECT slug, active, legacy_category FROM events.categories"
            " WHERE parent_id IS NULL ORDER BY sort_order"
        )
    ).all()
    assert len(tops) == 10
    assert tops[0] == ("parties-fetes", True, "fete")
    assert tops[-1] == ("wellness", False, "wellness")
    assert sum(1 for row in tops if row[1]) == 9
    subs = dict(
        connection.execute(
            text(
                "SELECT p.slug, count(*) FROM events.categories c"
                " JOIN events.categories p ON p.id = c.parent_id GROUP BY p.slug"
            )
        ).all()
    )
    assert subs == {
        "parties-fetes": 9,
        "music-live-shows": 8,
        "tours-outdoors": 7,
        "food-drink": 6,
        "sports-fitness": 6,
        "arts-culture": 6,
        "business-learning": 5,
        "markets-shopping": 4,
        "community-causes": 6,
    }


def test_backfill_classifies_existing_listings(migration_at_head):
    connection, migration = migration_at_head
    migration.downgrade()
    organiser = uuid.uuid4()
    connection.execute(
        text(
            "INSERT INTO events.organisers (id, slug, name, bio, verified, created_at)"
            " VALUES (:id, :slug, 'N', '', true, now())"
        ),
        {"id": organiser, "slug": f"o-{organiser.hex[:8]}"},
    )
    paid = _listing(connection, organiser, "fete", "ticketed", price=5000)
    free_tier = _listing(connection, organiser, "music", "ticketed", price=0)
    rsvp = _listing(connection, organiser, "faith", "rsvp")
    free = _listing(connection, organiser, "tech", "free")
    family = _listing(connection, organiser, "family", "free", tags="{beach}")
    family_again = _listing(
        connection, organiser, "family", "free", tags="{kid-friendly}"
    )
    wellness = _listing(connection, organiser, "wellness", "free")
    culture = _listing(connection, organiser, "culture", "free")

    migration.upgrade()

    assert _row(connection, paid)[:7] == (
        "paid",
        "tickets",
        "event",
        "public",
        False,
        "parties-fetes",
        None,
    )
    assert _row(connection, free_tier)[:2] == ("free", "tickets")
    assert _row(connection, rsvp)[1] == "rsvp"
    assert _row(connection, rsvp)[5:7] == ("community-causes", "church-faith")
    assert _row(connection, free)[:2] == ("free", "none")
    assert _row(connection, free)[5] == "business-learning"
    assert _row(connection, free)[7] == ["tech"]
    assert _row(connection, family)[5] == "community-causes"
    assert sorted(_row(connection, family)[7]) == ["beach", "kid-friendly"]
    assert _row(connection, family_again)[7] == ["kid-friendly"]
    assert _row(connection, wellness)[5] == "sports-fitness"
    assert _row(connection, culture)[5] == "arts-culture"


def test_constraints_reject_bad_values(migration_at_head):
    connection, _ = migration_at_head
    organiser = uuid.uuid4()
    connection.execute(
        text(
            "INSERT INTO events.organisers (id, slug, name, bio, verified, created_at)"
            " VALUES (:id, 'o-c', 'N', '', true, now())"
        ),
        {"id": organiser},
    )
    listing = _listing(connection, organiser, "fete", "free")
    for sql in (
        "UPDATE events.listings SET listing_type = 'boat'",
        "UPDATE events.listings SET access_type = 'private'",  # still public
        "UPDATE events.listings SET external_ticket_url = 'https://x.example'",
        "UPDATE events.listings SET booking_mode = 'external',"
        " external_ticket_url = 'http://x.example'",
        "UPDATE events.listings SET pricing_type = 'barter'",
    ):
        nested = connection.begin_nested()
        with pytest.raises(DBAPIError):
            connection.execute(text(sql + " WHERE id = :id"), {"id": listing})
        nested.rollback()


def test_downgrade_removes_the_additions(migration_at_head):
    connection, migration = migration_at_head
    migration.downgrade()
    columns = {
        row[0]
        for row in connection.execute(
            text(
                "SELECT column_name FROM information_schema.columns"
                " WHERE table_schema = 'events' AND table_name = 'listings'"
            )
        )
    }
    assert not columns & {"listing_type", "category_id", "curated"}
    assert (
        connection.execute(text("SELECT to_regclass('events.categories')")).scalar()
        is None
    )
    migration.upgrade()
