"""janitorial_0002: sites, auxiliary-building promotion and area defaults."""

from pathlib import Path

from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from alembic import command

ROOT = Path(__file__).resolve().parents[2]

# v1 rows as they exist before janitorial_0002.
V1_SEED = """
INSERT INTO buildings (id, name, code, sort_order) VALUES
  (1, 'Air Terminal Building (ATB)', 'air-terminal-building-atb', 0),
  (2, 'Auxiliary Buildings', 'auxiliary-buildings', 1);
INSERT INTO areas (id, building_id, section_id, name, sort_order) VALUES
  (10, 1, NULL, 'Restrooms', 0),
  (11, 1, NULL, 'Departure Lounge', 1),
  (12, 1, NULL, 'Project Office', 2),
  (20, 2, NULL, 'Stores Building (Warehouse)', 0),
  (21, 2, NULL, 'Air Traffic Control Tower & ECCAA Tech Block', 1);
INSERT INTO activities (id, slug, name) VALUES (1, 'sweep', 'Sweep');
INSERT INTO area_tasks (id, area_id, activity_id, freq_count, freq_period_value,
                        freq_period_unit) VALUES
  (100, 20, 1, 1, 1, 'day');
SELECT setval(pg_get_serial_sequence(name, 'id'), 100)
FROM unnest(ARRAY['buildings', 'areas', 'activities', 'area_tasks']) AS name;
"""


def _config(connection: Connection, database: str | None) -> Config:
    config = Config(str(ROOT / "src/janitorial/alembic.ini"))
    config.attributes["expected_database"] = database
    config.attributes["connection"] = connection
    return config


def _upgrade(engine: Engine) -> None:
    with engine.begin() as connection:
        config = _config(connection, engine.url.database)
        command.upgrade(config, "janitorial_0001")
        connection.execute(text(V1_SEED))
        command.upgrade(config, "head")


def test_sites_are_seeded_and_buildings_belong_to_mbia(
    fresh_weather_engine: Engine,
) -> None:
    _upgrade(fresh_weather_engine)
    with fresh_weather_engine.connect() as connection:
        sites = connection.execute(
            text("SELECT code, name FROM sites ORDER BY sort_order")
        ).all()
        terminal = connection.execute(
            text("SELECT site_id, kind FROM buildings WHERE id = 1")
        ).one()
    assert [code for code, _ in sites] == ["GND", "CRU"]
    assert terminal == (1, "terminal")


def test_auxiliary_areas_become_buildings_keeping_area_ids_and_tasks(
    fresh_weather_engine: Engine,
) -> None:
    _upgrade(fresh_weather_engine)
    with fresh_weather_engine.connect() as connection:
        promoted = connection.execute(
            text("""
                SELECT b.name, b.kind, b.site_id, a.id, a.name
                FROM areas a JOIN buildings b ON b.id = a.building_id
                WHERE a.id IN (20, 21) ORDER BY a.id
            """)
        ).all()
        task_area = connection.execute(
            text("SELECT area_id FROM area_tasks WHERE id = 100")
        ).scalar_one()
        placeholder = connection.execute(
            text("SELECT active FROM buildings WHERE id = 2")
        ).scalar_one()
    assert promoted == [
        ("Stores Building (Warehouse)", "auxiliary", 1, 20, "Whole building"),
        (
            "Air Traffic Control Tower & ECCAA Tech Block",
            "auxiliary",
            1,
            21,
            "Whole building",
        ),
    ]
    assert task_area == 20
    assert placeholder is False


def test_areas_get_codes_and_inferred_space_types(
    fresh_weather_engine: Engine,
) -> None:
    _upgrade(fresh_weather_engine)
    with fresh_weather_engine.connect() as connection:
        rows = {
            row[0]: row[1:]
            for row in connection.execute(
                text("SELECT id, code, space_type, cleanliness_level FROM areas")
            )
        }
    assert rows[10] == ("GND-A0010", "restroom", 1)
    assert rows[11] == ("GND-A0011", "lounge", 1)
    assert rows[12] == ("GND-A0012", "office", 2)
    # Promoted auxiliary areas are inferred from their building's name.
    assert rows[20] == ("GND-A0020", "storage", 3)
    assert rows[21] == ("GND-A0021", "technical", 3)


def test_new_areas_are_filled_by_the_insert_trigger(
    fresh_weather_engine: Engine,
) -> None:
    _upgrade(fresh_weather_engine)
    with fresh_weather_engine.begin() as connection:
        connection.execute(
            text("""
                INSERT INTO buildings (id, name, code, site_id) VALUES
                  (500, 'Lauriston Terminal', 'lauriston-terminal', 2)
            """)
        )
        area = connection.execute(
            text("""
                INSERT INTO areas (building_id, name) VALUES (500, 'Washrooms')
                RETURNING id, code, space_type, cleanliness_level
            """)
        ).one()
        explicit = connection.execute(
            text("""
                INSERT INTO areas (building_id, name, space_type)
                VALUES (500, 'Washrooms 2', 'other')
                RETURNING space_type, cleanliness_level
            """)
        ).one()
    assert area[1] == f"CRU-A{area[0]:04d}"
    assert area[2:] == ("restroom", 1)
    # An explicit space type is kept and no level is guessed for it.
    assert explicit == ("other", None)


def test_seeding_a_fresh_database_matches_the_migrated_layout(
    fresh_weather_engine: Engine,
) -> None:
    import csv

    import psycopg

    from scripts.seed_catalogues import seed_janitorial

    with fresh_weather_engine.begin() as connection:
        command.upgrade(_config(connection, fresh_weather_engine.url.database), "head")
    with (ROOT / "seed" / "janitorial-spec.csv").open(newline="") as handle:
        source_tasks = sum(1 for row in csv.DictReader(handle) if row["kind"] == "task")
    url = fresh_weather_engine.url.set(drivername="postgresql")
    with psycopg.connect(url.render_as_string(hide_password=False)) as conn:
        seed_janitorial(conn, apply=True)
        placeholder, auxiliary, whole, tasks, uncoded, terminals = conn.execute(
            "SELECT"
            " (SELECT count(*) FROM buildings WHERE name = 'Auxiliary Buildings'),"
            " (SELECT count(*) FROM buildings WHERE kind = 'auxiliary'),"
            " (SELECT count(*) FROM areas WHERE name = 'Whole building'),"
            " (SELECT count(*) FROM area_tasks),"
            " (SELECT count(*) FROM areas WHERE code IS NULL OR space_type IS NULL),"
            " (SELECT count(*) FROM buildings WHERE kind = 'terminal')"
        ).fetchone()
    assert placeholder == 0
    assert auxiliary == whole == 11
    assert tasks == source_tasks
    assert uncoded == 0
    assert terminals == 1
