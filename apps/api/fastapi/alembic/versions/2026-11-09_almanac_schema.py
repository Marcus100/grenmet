"""Almanac tables: yearly sun/moon table, principal moon phases, predicted tides.

Additive: a new ``almanac`` schema with three tables. Rows are written by
``scripts/build_almanac_year.py`` (astronomy) and ``scripts/import_tide_table.py``
(tides), never by this migration.

Revision ID: almanac20261109
Revises: authsigninreason20261104
"""

import sqlalchemy as sa
from sqlalchemy import Numeric

from alembic import op

revision = "almanac20261109"
down_revision = "authsigninreason20261104"
branch_labels = None
depends_on = None

SCHEMA = "almanac"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    op.create_table(
        "astro_day",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("location_key", sa.String(40), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("sunrise_utc", sa.DateTime(), nullable=False),
        sa.Column("sunset_utc", sa.DateTime(), nullable=False),
        sa.Column("civil_dawn_utc", sa.DateTime(), nullable=False),
        sa.Column("civil_dusk_utc", sa.DateTime(), nullable=False),
        sa.Column("moonrise_utc", sa.DateTime(), nullable=True),
        sa.Column("moonset_utc", sa.DateTime(), nullable=True),
        sa.Column("moon_phase", sa.String(30), nullable=False),
        sa.UniqueConstraint("location_key", "local_date", name="uq_almanac_astro_day"),
        schema=SCHEMA,
    )
    op.create_table(
        "moon_phase_event",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("phase_key", sa.String(20), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.UniqueConstraint("phase_key", "local_date", name="uq_almanac_moon_phase"),
        sa.CheckConstraint(
            "phase_key IN ('new', 'first_quarter', 'full', 'last_quarter')",
            name=op.f("moon_phase_event_phase_key_check"),
        ),
        schema=SCHEMA,
    )
    op.create_table(
        "tide_prediction",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("station_key", sa.String(20), nullable=False),
        sa.Column("event_type", sa.String(4), nullable=False),
        sa.Column("time_utc", sa.DateTime(), nullable=False),
        sa.Column("height_m_mllw", Numeric(8, 4), nullable=False),
        sa.Column("timing_quality", sa.String(60), nullable=False),
        sa.Column("status", sa.String(80), nullable=False),
        sa.Column("source_label", sa.String(120), nullable=False),
        sa.Column("source_version", sa.String(20), nullable=False),
        sa.UniqueConstraint(
            "station_key", "time_utc", name="uq_almanac_tide_station_time"
        ),
        sa.CheckConstraint(
            "event_type IN ('HIGH', 'LOW')",
            name=op.f("tide_prediction_event_type_check"),
        ),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("tide_prediction", schema=SCHEMA)
    op.drop_table("moon_phase_event", schema=SCHEMA)
    op.drop_table("astro_day", schema=SCHEMA)
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
