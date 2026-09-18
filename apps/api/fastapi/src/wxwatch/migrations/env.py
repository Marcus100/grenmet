"""Dedicated weather database migration runner; never uses the main DB URL."""

import os

from sqlalchemy import MetaData, create_engine, text
from sqlalchemy.engine import Connection, make_url
from sqlalchemy.pool import NullPool

from alembic import context
from src.wxwatch.config import wxwatch_settings

weather_metadata = MetaData()


def migrate(connection: Connection) -> None:
    actual = connection.execute(text("SELECT current_database()")).scalar_one()
    expected = context.config.attributes.get("expected_database") or os.environ.get(
        "WXWATCH_DB_NAME",
        "wxwatch_staging" if os.environ.get("ENVIRONMENT") == "staging" else "wxwatch",
    )
    if actual != expected or actual in {
        "app",
        "app_prod",
        "app_staging",
        "app_test",
        "postgres",
        "template0",
        "template1",
    }:
        raise RuntimeError("Refusing migration outside the configured weather database")
    connection.execute(text("SELECT pg_advisory_xact_lock(73190506)"))
    connection.execute(text("SET LOCAL search_path TO public"))
    context.configure(
        connection=connection,
        target_metadata=weather_metadata,
        version_table="wxwatch_alembic_version",
        version_table_schema="public",
        # Legacy weather tables remain managed by explicit migrations. Never
        # infer their deletion from the subset currently mapped by the API.
        include_name=lambda name, kind, parent: (
            kind != "table" or name in weather_metadata.tables
        ),
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    raise RuntimeError(
        "Weather migrations require a live database for target/history verification"
    )
existing = context.config.attributes.get("connection")
if existing is not None:
    migrate(existing)
else:
    if not wxwatch_settings.DATABASE_URL:
        raise RuntimeError("WXWATCH_DATABASE_URL is required")
    url = make_url(wxwatch_settings.DATABASE_URL)
    if url.get_backend_name() != "postgresql":
        raise RuntimeError("Weather migrations require PostgreSQL")
    engine = create_engine(url.set(drivername="postgresql+psycopg"), poolclass=NullPool)
    try:
        with engine.begin() as connection:
            migrate(connection)
    finally:
        engine.dispose()
