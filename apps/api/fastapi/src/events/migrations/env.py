import os

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, make_url
from sqlalchemy.pool import NullPool

from alembic import context
from src.events.config import events_settings


def migrate(connection: Connection) -> None:
    actual = connection.execute(text("SELECT current_database()")).scalar_one()
    expected = context.config.attributes.get("expected_database") or os.environ.get(
        "EVENTS_DB_NAME",
        "events_staging" if os.environ.get("ENVIRONMENT") == "staging" else "events",
    )
    if actual != expected or actual in {"app", "postgres", "template0", "template1"}:
        raise RuntimeError("Refusing migration outside the configured events database")
    connection.execute(text("SELECT pg_advisory_xact_lock(73190508)"))
    context.configure(
        connection=connection,
        target_metadata=None,
        version_table="events_alembic_version",
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    raise RuntimeError("Events migrations require a live database")
existing = context.config.attributes.get("connection")
if existing is not None:
    migrate(existing)
else:
    if not events_settings.DATABASE_URL:
        raise RuntimeError("EVENTS_DATABASE_URL is required")
    url = make_url(events_settings.DATABASE_URL)
    engine = create_engine(url.set(drivername="postgresql+psycopg"), poolclass=NullPool)
    try:
        with engine.begin() as connection:
            migrate(connection)
    finally:
        engine.dispose()
