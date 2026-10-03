"""Adopt verified Drizzle history or install the weather schema on an empty DB."""

import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.engine import Connection

from alembic import op

revision = "wxwatch_0001"
down_revision = None
branch_labels = None
depends_on = None
ASSETS = Path(__file__).resolve().parents[1]


def execute_sql(connection: Connection, sql: str) -> None:
    for statement in sql.split("--> statement-breakpoint"):
        if statement.strip():
            connection.exec_driver_sql(statement.strip())


def fingerprint(connection: Connection, schema: str) -> list[list[tuple[Any, ...]]]:
    queries = [
        """SELECT c.relname, a.attname, format_type(a.atttypid,a.atttypmod),
           a.attnotnull, a.attidentity, pg_get_expr(d.adbin,d.adrelid)
           FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
           LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
           WHERE n.nspname=:schema AND c.relkind IN ('r','p')
           AND c.relname != 'wxwatch_alembic_version'
           ORDER BY c.relname,a.attnum""",
        """SELECT c.relname, k.conname, pg_get_constraintdef(k.oid)
           FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
           JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname=:schema AND c.relname != 'wxwatch_alembic_version'
           ORDER BY c.relname,k.conname""",
        """SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=:schema
           AND tablename != 'wxwatch_alembic_version' ORDER BY tablename,indexname""",
        """SELECT t.typname,e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
           JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=:schema
           ORDER BY t.typname,e.enumsortorder""",
    ]

    def normalize(value: Any) -> Any:
        if isinstance(value, str):
            return (
                value.replace('"' + schema + '".', "")
                .replace(schema + ".", "")
                .replace("public.", "")
            )
        return value

    return [
        [
            tuple(normalize(value) for value in row)
            for row in connection.execute(text(query), {"schema": schema})
        ]
        for query in queries
    ]


def upgrade() -> None:
    connection = op.get_bind()
    baseline = (ASSETS / "baseline.sql").read_text()
    committed = json.loads((ASSETS / "drizzle-history.json").read_text())
    has_history = connection.execute(
        text("SELECT to_regclass('drizzle.__drizzle_migrations')")
    ).scalar()
    tables = (
        connection.execute(
            text(
                "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename != 'wxwatch_alembic_version'"
            )
        )
        .scalars()
        .all()
    )
    types = (
        connection.execute(
            text(
                "SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e'"
            )
        )
        .scalars()
        .all()
    )
    if not has_history:
        if tables or types:
            raise RuntimeError(
                "Untracked weather schema: explicit reconciliation required"
            )
        execute_sql(connection, baseline)
        return
    applied = connection.execute(
        text(
            "SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at"
        )
    ).all()
    if (
        not applied
        or len(applied) > len(committed)
        or any(
            row.hash != expected["hash"]
            or int(row.created_at) != expected["created_at"]
            for row, expected in zip(applied, committed, strict=False)
        )
    ):
        raise RuntimeError("Drizzle weather history differs from the recorded baseline")
    for migration in committed[len(applied) :]:
        execute_sql(connection, migration["sql"])
    # Build the expected schema in a disposable namespace in this transaction.
    # Compare columns, defaults, constraints, indexes and enums before adoption.
    scratch = "wxverify_" + uuid4().hex
    connection.exec_driver_sql('CREATE SCHEMA "' + scratch + '"')
    connection.exec_driver_sql('SET LOCAL search_path TO "' + scratch + '"')
    execute_sql(connection, baseline.replace('"public".', '"' + scratch + '".'))
    expected = fingerprint(connection, scratch)
    actual = fingerprint(connection, "public")
    if actual != expected:
        raise RuntimeError(
            "Weather schema differs from the expected baseline; adoption refused"
        )
    connection.exec_driver_sql('DROP SCHEMA "' + scratch + '" CASCADE')
    connection.exec_driver_sql("SET LOCAL search_path TO public")


def downgrade() -> None:
    raise RuntimeError(
        "Weather baseline adoption cannot be undone by dropping operational tables"
    )
