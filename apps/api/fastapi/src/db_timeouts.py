"""Lock and idle-transaction limits for Postgres connections.

Both guard against a lock queue that never clears (release runbook, "Migration lock
timeouts"): Alembic gives up on a DDL statement that waits too long for a lock, and the
main engine ends a connection left idle inside an open transaction.
"""

import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection

# A Postgres interval for lock_timeout: "0" disables, otherwise digits and a unit.
_LOCK_TIMEOUT = re.compile(r"0|[1-9][0-9]{0,5}(ms|s|min)")


def parse_lock_timeout(value: str) -> str:
    """Return a validated lock_timeout interval, or raise before anything reaches SQL."""
    cleaned = value.strip()
    if not _LOCK_TIMEOUT.fullmatch(cleaned):
        raise ValueError(
            f"MIGRATION_LOCK_TIMEOUT must be a Postgres interval such as 10s, 500ms or 1min, or 0: {value!r}"
        )
    return cleaned


def set_migration_lock_timeout(connection: Connection, interval: str) -> None:
    """Apply lock_timeout to the current transaction only, so it cannot leak into later work."""
    value = parse_lock_timeout(interval)
    connection.execute(
        text("SELECT set_config('lock_timeout', :value, true)"), {"value": value}
    )


def idle_in_transaction_connect_args(seconds: int) -> dict[str, Any]:
    """asyncpg startup settings that end a connection idle in a transaction; 0 leaves Postgres' default."""
    if seconds <= 0:
        return {}
    return {
        "server_settings": {
            "idle_in_transaction_session_timeout": str(seconds * 1000),
        }
    }
