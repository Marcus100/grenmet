import asyncio
import selectors
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Add the project root to Python path
sys.path.append(str(Path(__file__).parent.parent))

from src import db_timeouts

from src.config import settings
from src.orm import POSTGRES_INDEXES_NAMING_CONVENTION, Base
from src.model_registry import (
    extension_tables,
    import_all_models,
    object_filter,
)

# Every main-database model, so autogenerate never proposes dropping a live table.
import_all_models()

config = context.config
config.set_main_option("sqlalchemy.url", str(settings.SQLALCHEMY_DATABASE_URI))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

Base.metadata.naming_convention = POSTGRES_INDEXES_NAMING_CONVENTION
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        compare_type=True,
        include_object=object_filter(),
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    skip_tables = extension_tables(connection)
    # The lookup opened a transaction; end it, or Alembic treats the connection
    # as externally managed and the migration is rolled back on close.
    connection.commit()
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_schemas=True,
        compare_type=True,
        include_object=object_filter(skip_tables),
    )

    with context.begin_transaction():
        # Before the advisory lock and the DDL: a statement that waits on a leaked
        # session fails after MIGRATION_LOCK_TIMEOUT instead of stalling the deploy.
        # Session-level, so it survives autocommit_block commits (see db_timeouts).
        db_timeouts.set_migration_lock_timeout(
            connection, settings.MIGRATION_LOCK_TIMEOUT
        )
        connection.exec_driver_sql("SELECT pg_advisory_xact_lock(73190506)")
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    if sys.platform == "win32":
        loop = asyncio.SelectorEventLoop(selectors.SelectSelector())
        try:
            loop.run_until_complete(run_async_migrations())
        finally:
            loop.close()
        return

    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
