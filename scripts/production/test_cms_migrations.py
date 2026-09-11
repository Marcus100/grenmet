"""Exercise committed CMS migration SQL in an isolated PostgreSQL schema."""

import os
import re
import unittest
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql

MIGRATIONS = Path(__file__).resolve().parents[2] / "apps/web/cms/src/migrations"
SQL_BLOCK = re.compile(r"db\.execute\(sql`(.*?)`\)", re.DOTALL)


@unittest.skipUnless(
    os.environ.get("CMS_MIGRATION_TEST_DSN"),
    "requires a local PostgreSQL test connection",
)
class MediaMigrationTests(unittest.TestCase):
    def test_media_upgrade_downgrade_and_reapply(self):
        schema = f"cms_migration_test_{uuid4().hex}"
        initial = SQL_BLOCK.findall(
            (MIGRATIONS / "20260906_203710_initial.ts").read_text()
        )
        media = SQL_BLOCK.findall((MIGRATIONS / "20260910_184226.ts").read_text())
        self.assertEqual(len(media), 2)
        with psycopg.connect(os.environ["CMS_MIGRATION_TEST_DSN"]) as connection:
            try:
                connection.execute(
                    sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema))
                )
                connection.execute(
                    sql.SQL("SET LOCAL search_path TO {}").format(
                        sql.Identifier(schema)
                    )
                )

                def execute_migration(statement):
                    # Generated migrations qualify enum/FK targets with public;
                    # redirect those references into this transaction's private schema.
                    connection.execute(statement.replace('"public".', f'"{schema}".'))

                execute_migration(initial[0])
                connection.execute(
                    "INSERT INTO users(fastapi_user_id, username, email, role) VALUES ('test-id', 'editor', 'editor@example.test', 'editor')"
                )
                execute_migration(media[0])
                execute_migration(media[1])
                self.assertEqual(
                    connection.execute("SELECT count(*) FROM users").fetchone()[0], 1
                )
                self.assertIsNone(
                    connection.execute("SELECT to_regclass('media')").fetchone()[0]
                )
                self.assertIsNotNone(
                    connection.execute("SELECT to_regclass('content')").fetchone()[0]
                )
                execute_migration(media[0])
                self.assertIsNotNone(
                    connection.execute("SELECT to_regclass('media')").fetchone()[0]
                )
            finally:
                connection.rollback()
