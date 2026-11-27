"""Rehearse the about-and-gallery migration (bookingabout20261127) up and down inside
a rolled-back transaction: one additive nullable column with its length CHECK, the new
``bookings.gallery_photo`` table, and a downgrade that drops only what it added."""

import os

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text

from src.config import settings
from src.database import engine
from tests.database_target import require_owned_database

REVISION = "bookingabout20261127"


@pytest.fixture
async def rehearsal(db_async):
    await db_async.rollback()
    require_owned_database(settings.POSTGRES_DB, os.environ)
    target = ScriptDirectory.from_config(Config("alembic.ini")).get_revision(REVISION)
    assert target is not None
    assert target.down_revision == "bookingbookedname20261126"
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text("SET LOCAL lock_timeout = '5s'"))
            with Operations.context(MigrationContext.configure(connection)):
                yield connection, target.module
        finally:
            transaction.rollback()


def _profile_columns(connection) -> set[str]:
    rows = connection.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'bookings' AND table_name = 'profile'"
        )
    )
    return {row[0] for row in rows}


def _gallery_columns(connection) -> set[str]:
    rows = connection.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'bookings' AND table_name = 'gallery_photo'"
        )
    )
    return {row[0] for row in rows}


def _about_check(connection) -> str | None:
    return connection.execute(
        text(
            "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c "
            "JOIN pg_class t ON t.oid = c.conrelid "
            "JOIN pg_namespace n ON n.oid = t.relnamespace "
            "WHERE n.nspname = 'bookings' AND t.relname = 'profile' "
            "AND c.conname = 'profile_about_check'"
        )
    ).scalar_one_or_none()


def test_upgrade_adds_the_about_column_its_check_and_the_gallery_table(rehearsal):
    connection, migration = rehearsal
    migration.downgrade()
    assert "about" not in _profile_columns(connection)
    assert _about_check(connection) is None
    assert _gallery_columns(connection) == set()

    migration.upgrade()
    assert "about" in _profile_columns(connection)
    definition = _about_check(connection)
    assert definition is not None
    assert "char_length((about)::text) >= 1" in definition
    assert "char_length((about)::text) <= 1000" in definition
    assert _gallery_columns(connection) == {
        "id",
        "organisation_id",
        "file_id",
        "sort_order",
        "created_at",
    }


def test_about_is_nullable_with_no_default(rehearsal):
    connection, migration = rehearsal
    migration.downgrade()
    migration.upgrade()
    is_nullable, default = connection.execute(
        text(
            "SELECT is_nullable, column_default FROM information_schema.columns "
            "WHERE table_schema = 'bookings' AND table_name = 'profile' "
            "AND column_name = 'about'"
        )
    ).one()
    assert is_nullable == "YES"
    assert default is None


def test_one_file_appears_once_per_business(rehearsal):
    connection, migration = rehearsal
    migration.downgrade()
    migration.upgrade()
    unique = connection.execute(
        text(
            "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c "
            "JOIN pg_class t ON t.oid = c.conrelid "
            "JOIN pg_namespace n ON n.oid = t.relnamespace "
            "WHERE n.nspname = 'bookings' AND t.relname = 'gallery_photo' "
            "AND c.conname = 'gallery_photo_file'"
        )
    ).scalar_one()
    assert "UNIQUE (organisation_id, file_id)" in unique


def test_downgrade_drops_only_what_it_added(rehearsal):
    connection, migration = rehearsal
    before = _profile_columns(connection)
    migration.downgrade()
    after = _profile_columns(connection)
    assert before - after == {"about"}
    assert {"booking_policy", "cover_file_id", "logo_file_id"} <= after
    assert _about_check(connection) is None
    assert _gallery_columns(connection) == set()
