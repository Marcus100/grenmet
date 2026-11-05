"""Migration lock timeout and idle-in-transaction limit (release runbook, "Migration lock timeouts")."""

import ast
import time
from pathlib import Path

import pytest
from sqlalchemy.exc import DBAPIError

from src import database, db_timeouts
from src.config import Settings, settings

ALEMBIC_ENV = Path(__file__).resolve().parents[1] / "alembic" / "env.py"


def test_lock_timeout_default_is_ten_seconds() -> None:
    assert Settings.model_fields["MIGRATION_LOCK_TIMEOUT"].default == "10s"


@pytest.mark.parametrize("value", ["10s", "500ms", "1min", "0", " 30s "])
def test_lock_timeout_accepts_postgres_intervals(value: str) -> None:
    assert db_timeouts.parse_lock_timeout(value) == value.strip()


@pytest.mark.parametrize("value", ["", "10", "10 seconds", "10s; DROP TABLE x", "1h"])
def test_lock_timeout_rejects_anything_else(value: str) -> None:
    with pytest.raises(ValueError, match="MIGRATION_LOCK_TIMEOUT"):
        db_timeouts.parse_lock_timeout(value)


def test_idle_in_transaction_args_follow_seconds() -> None:
    assert db_timeouts.idle_in_transaction_connect_args(300) == {
        "server_settings": {"idle_in_transaction_session_timeout": "300000"}
    }
    assert db_timeouts.idle_in_transaction_connect_args(0) == {}


@pytest.mark.usefixtures("db_async")
async def test_lock_timeout_applies_to_the_current_transaction_only() -> None:
    async with database.async_engine.connect() as conn:
        await conn.run_sync(db_timeouts.set_migration_lock_timeout, "10s")
        shown = await conn.exec_driver_sql("SHOW lock_timeout")
        assert shown.scalar_one() == "10s"
        await conn.commit()
        after = await conn.exec_driver_sql("SHOW lock_timeout")
        assert after.scalar_one() == "0"


@pytest.mark.usefixtures("db_async")
async def test_migration_ddl_fails_fast_behind_a_leaked_read_lock() -> None:
    """Same shape as the v1.0.3 stall: a read that never ends its transaction holds ACCESS SHARE."""
    async with database.async_engine.begin() as conn:
        await conn.exec_driver_sql("DROP TABLE IF EXISTS public.lock_probe")
        await conn.exec_driver_sql("CREATE TABLE public.lock_probe (id integer)")
    leaked = await database.async_engine.connect()
    try:
        await leaked.exec_driver_sql("SELECT count(*) FROM public.lock_probe")
        async with database.async_engine.connect() as migration:
            await migration.run_sync(db_timeouts.set_migration_lock_timeout, "200ms")
            started = time.monotonic()
            with pytest.raises(DBAPIError, match="lock timeout"):
                await migration.exec_driver_sql(
                    "ALTER TABLE public.lock_probe ADD COLUMN extra integer"
                )
            assert time.monotonic() - started < 5
            await migration.rollback()
    finally:
        await leaked.rollback()
        await leaked.close()
        async with database.async_engine.begin() as conn:
            await conn.exec_driver_sql("DROP TABLE IF EXISTS public.lock_probe")


@pytest.mark.usefixtures("db_async")
async def test_main_engine_sets_the_idle_in_transaction_limit() -> None:
    async with database.async_engine.connect() as conn:
        result = await conn.exec_driver_sql(
            "SELECT setting FROM pg_settings WHERE name = 'idle_in_transaction_session_timeout'"
        )
        assert result.scalar_one() == str(
            settings.DB_IDLE_IN_TRANSACTION_TIMEOUT * 1000
        )


def test_alembic_env_sets_lock_timeout_before_the_migration_lock() -> None:
    """env.py cannot be imported outside Alembic, so check its wiring in the source."""
    tree = ast.parse(ALEMBIC_ENV.read_text(encoding="utf-8"))
    run = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "do_run_migrations"
    )
    timeout = [
        node
        for node in ast.walk(run)
        if isinstance(node, ast.Call)
        and ast.unparse(node.func) == "db_timeouts.set_migration_lock_timeout"
    ]
    advisory = [
        node
        for node in ast.walk(run)
        if isinstance(node, ast.Call) and "pg_advisory_xact_lock" in ast.unparse(node)
    ]
    assert len(timeout) == 1, "do_run_migrations must set the lock timeout once"
    assert [ast.unparse(arg) for arg in timeout[0].args] == [
        "connection",
        "settings.MIGRATION_LOCK_TIMEOUT",
    ]
    assert advisory, "the advisory migration lock is still taken"
    assert timeout[0].lineno < advisory[0].lineno
