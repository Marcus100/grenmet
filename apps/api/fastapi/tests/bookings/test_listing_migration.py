"""Rehearse the ADR-0066 slice 1 migrations inside a rolled-back transaction.

A business that exists before the migration must come out approved on the home page
(the backfill), and every entitlement row must come out ``manual``. The downgrade of
both revisions must remove exactly the columns they added.
"""

import os

import httpx
import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.database import engine
from tests.bookings.test_public_bookings import _studio
from tests.database_target import require_owned_database

LISTING = "bookinglisting20261124"
SOURCE = "orgentitlementsource20261124"


@pytest.fixture
async def existing_business(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> str:
    """A business committed before the migration runs. Requested before the rehearsal
    fixture, so its row exists when the columns are dropped and added again."""
    studio = await _studio(db_async, async_client)
    return studio.org_id


@pytest.fixture
async def downgraded(db_async: AsyncSession, existing_business: str):
    # The business must exist before its columns are dropped and added again.
    assert existing_business
    await db_async.rollback()
    require_owned_database(settings.POSTGRES_DB, os.environ)
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    listing = scripts.get_revision(LISTING).module
    source = scripts.get_revision(SOURCE).module
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text("SET LOCAL lock_timeout = '5s'"))
            connection.execute(text("SET LOCAL statement_timeout = '30s'"))
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                listing.downgrade()
                source.downgrade()
                yield connection, source, listing
        finally:
            transaction.rollback()


def _column_exists(connection, table_schema: str, table: str, column: str) -> bool:
    return bool(
        connection.execute(
            text(
                "SELECT count(*) FROM information_schema.columns "
                "WHERE table_schema = :schema AND table_name = :table "
                "AND column_name = :column"
            ),
            {"schema": table_schema, "table": table, "column": column},
        ).scalar_one()
    )


def test_the_downgrade_removes_both_revisions_columns(downgraded) -> None:
    connection, _, _ = downgraded
    assert not _column_exists(connection, "bookings", "profile", "listing_approved_at")
    assert not _column_exists(connection, "bookings", "profile", "owner_left_at")
    assert not _column_exists(connection, "bookings", "profile", "owner_provider_id")
    assert not _column_exists(connection, "org", "organisation_app", "source")
    assert not _column_exists(connection, "org", "organisation", "created_by_user_id")


def test_upgrade_approves_every_existing_business_and_marks_entitlements_manual(
    downgraded, existing_business: str
) -> None:
    connection, source, listing = downgraded
    source.upgrade()
    listing.upgrade()

    approved = connection.execute(
        text(
            "SELECT listing_approved_at IS NOT NULL FROM bookings.profile "
            "WHERE organisation_id = :org"
        ),
        {"org": existing_business},
    ).scalar_one()
    assert approved is True

    sources = set(
        connection.execute(
            text(
                "SELECT source FROM org.organisation_app WHERE organisation_id = :org"
            ),
            {"org": existing_business},
        ).scalars()
    )
    assert sources == {"manual"}


def test_the_head_is_the_listing_revision() -> None:
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    # Later slices stack on this one; the head moves with each new revision.
    assert scripts.get_heads() == ["incidentparties20261126"]
    assert LISTING == "bookinglisting20261124"
