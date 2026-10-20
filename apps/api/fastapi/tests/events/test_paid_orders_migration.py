"""events_0010: additive paid-order columns, the widened payment_method check and
a clean downgrade (ADR-0003: no cross-database FK on the intent id)."""

import uuid

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import IntegrityError

from alembic import command
from tests.events.support import ROOT


def _config(connection: Connection, database: str | None) -> Config:
    config = Config(str(ROOT / "src/events/alembic.ini"))
    config.attributes["expected_database"] = database
    config.attributes["connection"] = connection
    return config


def _columns(connection: Connection) -> dict[str, str]:
    rows = connection.execute(
        text(
            "SELECT column_name, data_type FROM information_schema.columns"
            " WHERE table_name = 'orders'"
        )
    )
    return {row[0]: row[1] for row in rows}


def _order(connection: Connection, **values: object) -> None:
    listing = connection.execute(text("SELECT id FROM listings LIMIT 1")).scalar()
    connection.execute(
        text(
            "INSERT INTO orders (id, listing_id, user_id, payment_method, channel)"
            " VALUES (:id, :listing, :user, :method, 'online')"
        ),
        {
            "id": uuid.uuid4(),
            "listing": listing,
            "user": uuid.uuid4(),
            "method": values.get("method", "none"),
        },
    )


def test_upgrade_adds_nullable_columns_and_downgrade_removes_them(
    fresh_weather_engine: Engine,
) -> None:
    database = fresh_weather_engine.url.database
    with fresh_weather_engine.begin() as connection:
        config = _config(connection, database)
        command.upgrade(config, "events_0009")
        before = _columns(connection)
        assert "payment_intent_id" not in before
        command.upgrade(config, "events_0010")
        after = _columns(connection)
        assert after["payment_intent_id"] == "uuid"
        assert {"payment_expires_at", "paid_at", "refunded_minor"} <= set(after)
        # No foreign key leaves the Events database.
        foreign = connection.execute(
            text(
                "SELECT count(*) FROM information_schema.table_constraints"
                " WHERE table_name = 'orders' AND constraint_type = 'FOREIGN KEY'"
                " AND constraint_name ILIKE '%intent%'"
            )
        ).scalar()
        assert foreign == 0
        indexes = {
            name
            for (name,) in connection.execute(
                text("SELECT indexname FROM pg_indexes WHERE tablename = 'orders'")
            )
        }
        assert {
            "ix_orders_payment_intent",
            "ix_orders_pending_expiry",
            "ux_orders_online_key",
        } <= indexes
        command.downgrade(config, "events_0009")
        assert "payment_intent_id" not in _columns(connection)
        command.upgrade(config, "head")
        assert "payment_intent_id" in _columns(connection)


def test_payment_method_online_is_allowed_and_junk_is_not(
    fresh_weather_engine: Engine,
) -> None:
    with fresh_weather_engine.begin() as connection:
        command.upgrade(_config(connection, fresh_weather_engine.url.database), "head")
        organiser = uuid.uuid4()
        connection.execute(
            text("INSERT INTO organisers (id, slug, name) VALUES (:id, 'o', 'O')"),
            {"id": organiser},
        )
        connection.execute(
            text(
                "INSERT INTO listings (id, slug, title, category, parish, venue,"
                " starts_at, ends_at, organiser_id, status, admission)"
                " VALUES (gen_random_uuid(), 'l', 'L', 'fete', 'st-george', 'V',"
                " now(), now() + interval '2 hours', :o, 'published', 'ticketed')"
            ),
            {"o": organiser},
        )
        _order(connection, method="online")
        with pytest.raises(IntegrityError), connection.begin_nested():
            _order(connection, method="paypal")
