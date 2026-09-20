import json
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text

from alembic import command

ROOT = Path(__file__).resolve().parents[2]


def migrate(engine, expected=None):
    config = Config(str(ROOT / "src/wxwatch/alembic.ini"))
    config.attributes["expected_database"] = expected or engine.url.database
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


def test_fresh_repeat_and_wrong_target(weather_engine):
    with pytest.raises(RuntimeError, match="Refusing"):
        migrate(weather_engine, "other")
    migrate(weather_engine)
    migrate(weather_engine)
    with weather_engine.connect() as connection:
        assert (
            connection.scalar(text("SELECT version_num FROM wxwatch_alembic_version"))
            == "wxwatch_0006"
        )


def test_adopts_legacy_without_losing_images(weather_engine):
    history = json.loads(
        (ROOT / "src/wxwatch/migrations/drizzle-history.json").read_text()
    )[0]
    with weather_engine.begin() as connection:
        for statement in history["sql"].split("--> statement-breakpoint"):
            connection.exec_driver_sql(statement)
        connection.exec_driver_sql("CREATE SCHEMA drizzle")
        connection.exec_driver_sql(
            "CREATE TABLE drizzle.__drizzle_migrations(hash text,created_at bigint)"
        )
        connection.execute(
            text("INSERT INTO drizzle.__drizzle_migrations VALUES (:hash,:created_at)"),
            history,
        )
        connection.exec_driver_sql(
            "INSERT INTO weather_images(storage_path,fetched_at,name,spider_name) VALUES ('old.gif',now(),'123_cloud.gif','goes19')"
        )
    migrate(weather_engine)
    with weather_engine.connect() as connection:
        assert connection.execute(
            text("SELECT storage_path,product_key,time_basis FROM weather_images")
        ).one() == ("old.gif", "goes19:cloud.gif", "legacy_unknown")


def test_refuses_untracked_schema(weather_engine):
    with weather_engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE unexpected(id integer)")
    with pytest.raises(RuntimeError, match="Untracked"):
        migrate(weather_engine)
