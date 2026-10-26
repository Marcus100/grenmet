"""Exercise fresh installation and non-destructive Drizzle adoption on real DBs."""

import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.engine import Engine

from alembic import command
from src.wxproducts.models import weather_metadata

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "src/wxproducts/migrations"


def migrate(engine: Engine, expected: str | None = None) -> None:
    config = Config(str(ROOT / "src/wxproducts/alembic.ini"))
    config.attributes["expected_database"] = expected or engine.url.database
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


def install_drizzle(engine: Engine, count: int = 3) -> None:
    history = json.loads((ASSETS / "drizzle-history.json").read_text())
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE SCHEMA drizzle")
        connection.exec_driver_sql(
            "CREATE TABLE drizzle.__drizzle_migrations (hash text, created_at bigint)"
        )
        for migration in history[:count]:
            for statement in migration["sql"].split("--> statement-breakpoint"):
                if statement.strip():
                    connection.exec_driver_sql(statement.strip())
            connection.execute(
                text(
                    "INSERT INTO drizzle.__drizzle_migrations VALUES (:hash,:created_at)"
                ),
                migration,
            )


def test_fresh_repeat_and_metadata_isolation(fresh_weather_engine: Engine) -> None:
    weather_engine = fresh_weather_engine
    migrate(weather_engine)
    migrate(weather_engine)
    with weather_engine.connect() as connection:
        assert (
            connection.execute(
                text("SELECT version_num FROM wxproducts_alembic_version")
            ).scalar_one()
            == "wxproducts_0005"
        )
        assert (
            connection.execute(
                text("SELECT count(*) FROM authored_products")
            ).scalar_one()
            == 0
        )
        assert connection.execute(
            text("SELECT to_regclass('morning_products')")
        ).scalar_one()
    assert set(weather_metadata.tables) == {
        "authored_products",
        "authored_product_revisions",
        "aviation_drafts",
        "aviation_draft_revisions",
        "tropical_systems",
        "tropical_system_entries",
        "tropical_system_changes",
    }


@pytest.mark.parametrize("count", [1, 2, 3])
def test_adopts_supported_history_and_preserves_records(
    fresh_weather_engine: Engine, count: int
) -> None:
    weather_engine = fresh_weather_engine
    install_drizzle(weather_engine, count)
    if count == 3:
        with weather_engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO authored_products(id,kind,draft,revision) VALUES (:id,'morning','{}',7)"
                ),
                {"id": uuid4()},
            )
    migrate(weather_engine)
    migrate(weather_engine)
    with weather_engine.connect() as connection:
        assert connection.execute(
            text("SELECT count(*) FROM authored_products")
        ).scalar_one() == (1 if count == 3 else 0)
        assert (
            connection.execute(
                text("SELECT count(*) FROM drizzle.__drizzle_migrations")
            ).scalar_one()
            == count
        )


@pytest.mark.parametrize(
    "alteration", ["history", "schema", "untracked", "wrong-target"]
)
def test_refuses_unverified_database(
    fresh_weather_engine: Engine, alteration: str
) -> None:
    weather_engine = fresh_weather_engine
    if alteration in {"history", "schema"}:
        install_drizzle(weather_engine)
        with weather_engine.begin() as connection:
            if alteration == "history":
                connection.exec_driver_sql(
                    "UPDATE drizzle.__drizzle_migrations SET hash='unexpected'"
                )
            else:
                connection.exec_driver_sql(
                    "ALTER TABLE authored_products ADD COLUMN unexpected text"
                )
    elif alteration == "untracked":
        with weather_engine.begin() as connection:
            connection.exec_driver_sql("CREATE TABLE unrelated(id int)")
    with pytest.raises(RuntimeError):
        migrate(weather_engine, "wxproducts" if alteration == "wrong-target" else None)
    with weather_engine.connect() as connection:
        assert (
            connection.execute(
                text("SELECT to_regclass('wxproducts_alembic_version')")
            ).scalar_one()
            is None
        )


def test_wxproducts_migrations_form_one_chain_with_a_single_head() -> None:
    from alembic.script import ScriptDirectory

    script = ScriptDirectory.from_config(
        Config(str(ROOT / "src/wxproducts/alembic.ini"))
    )
    assert script.get_heads() == ["wxproducts_0005"]


def test_tropical_system_changes_downgrade_drops_only_its_table(
    fresh_weather_engine: Engine,
) -> None:
    migrate(fresh_weather_engine)
    config = Config(str(ROOT / "src/wxproducts/alembic.ini"))
    config.attributes["expected_database"] = fresh_weather_engine.url.database
    with fresh_weather_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "wxproducts_0003")
    with fresh_weather_engine.connect() as connection:
        assert (
            connection.execute(
                text("SELECT to_regclass('tropical_system_changes')")
            ).scalar_one()
            is None
        )
        assert connection.execute(
            text("SELECT to_regclass('tropical_systems')")
        ).scalar_one()


def test_0005_stamps_existing_entries_with_the_current_storm_id(
    fresh_weather_engine: Engine,
) -> None:
    config = Config(str(ROOT / "src/wxproducts/alembic.ini"))
    config.attributes["expected_database"] = fresh_weather_engine.url.database
    with fresh_weather_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "wxproducts_0004")
        product, system = uuid4(), uuid4()
        connection.execute(
            text(
                "INSERT INTO authored_products (id, kind, draft, revision, published) "
                "VALUES (:p, 'outlook', '{}', 1, '{}')"
            ),
            {"p": product},
        )
        connection.execute(
            text(
                "INSERT INTO authored_product_revisions (product_id, revision, "
                "action, content, actor_id, actor_name, change_summary) "
                "VALUES (:p, 1, 'publish', '{}', 'a', 'A', 'x')"
            ),
            {"p": product},
        )
        connection.execute(
            text(
                "INSERT INTO tropical_systems (id, season, sequence, name, "
                "feature_type, nhc_storm_id, created_by, updated_by) "
                "VALUES (:s, 2026, 1, 'X', 'disturbance', 'al072026', 'a', 'a')"
            ),
            {"s": system},
        )
        connection.execute(
            text(
                "INSERT INTO tropical_system_entries (system_id, product_id, "
                "revision, action, issued_at, name, feature_type) "
                "VALUES (:s, :p, 1, 'publish', now(), 'X', 'disturbance')"
            ),
            {"s": system, "p": product},
        )
        command.upgrade(config, "head")
        assert (
            connection.execute(
                text("SELECT nhc_storm_id FROM tropical_system_entries")
            ).scalar_one()
            == "al072026"
        )


def test_concurrent_migrations_serialize(fresh_weather_engine: Engine) -> None:
    weather_engine = fresh_weather_engine
    environment = {
        **os.environ,
        "WXPRODUCTS_DATABASE_URL": weather_engine.url.render_as_string(
            hide_password=False
        ),
        "WXPRODUCTS_DB_NAME": str(weather_engine.url.database),
    }

    def run() -> int:
        return subprocess.run(
            [
                sys.executable,
                "-m",
                "alembic",
                "-c",
                "src/wxproducts/alembic.ini",
                "upgrade",
                "head",
            ],
            cwd=ROOT,
            env=environment,
            capture_output=True,
            timeout=60,
        ).returncode

    with ThreadPoolExecutor(max_workers=2) as executor:
        assert list(executor.map(lambda _: run(), range(2))) == [0, 0]
