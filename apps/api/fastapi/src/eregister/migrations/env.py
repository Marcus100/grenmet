import os

from sqlalchemy import MetaData, create_engine, text
from sqlalchemy.engine import Connection, make_url
from sqlalchemy.pool import NullPool

from alembic import context
from src.eregister.config import eregister_settings


def migrate(connection: Connection) -> None:
    actual = connection.execute(text("SELECT current_database()")).scalar_one()
    expected = context.config.attributes.get("expected_database") or os.environ.get(
        "EREGISTER_DB_NAME", "eregister"
    )
    if actual != expected or actual in {"app", "postgres", "template0", "template1"}:
        raise RuntimeError(
            "Refusing migration outside the configured eRegister database"
        )
    context.configure(
        connection=connection,
        target_metadata=MetaData(),
        version_table="eregister_alembic_version",
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    raise RuntimeError("eRegister migrations require a live database")
existing = context.config.attributes.get("connection")
if existing is not None:
    migrate(existing)
else:
    if not eregister_settings.DATABASE_URL:
        raise RuntimeError("EREGISTER_DATABASE_URL is required")
    url = make_url(eregister_settings.DATABASE_URL)
    engine = create_engine(url.set(drivername="postgresql+psycopg"), poolclass=NullPool)
    try:
        with engine.begin() as connection:
            migrate(connection)
    finally:
        engine.dispose()
