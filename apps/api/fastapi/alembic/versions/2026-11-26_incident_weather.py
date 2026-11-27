"""Incidents: the weather report at the time (#1876).

Additive: four nullable columns on ``incidents.incident`` and two checks that hold
for every existing row (all four columns start NULL).

Revision ID: incidentweather20261126
Revises: incidentparties20261126
"""

import sqlalchemy as sa

from alembic import op

revision = "incidentweather20261126"
down_revision = "incidentparties20261126"
branch_labels = None
depends_on = None

SCHEMA = "incidents"


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "incident",
        sa.Column("weather_station", sa.String(4), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "incident",
        sa.Column("weather_observed_at", sa.DateTime(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "incident",
        sa.Column("weather_report", sa.String(1000), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "incident",
        sa.Column("weather_source", sa.String(12), nullable=True),
        schema=SCHEMA,
    )
    op.create_check_constraint(
        op.f("incident_weather_source_check"),
        "incident",
        "weather_source IS NULL OR weather_source IN ('observation', 'manual')",
        schema=SCHEMA,
    )
    op.create_check_constraint(
        op.f("incident_weather_pair_check"),
        "incident",
        "(weather_report IS NULL) = (weather_source IS NULL)",
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_constraint(op.f("incident_weather_pair_check"), "incident", schema=SCHEMA)
    op.drop_constraint(op.f("incident_weather_source_check"), "incident", schema=SCHEMA)
    op.drop_column("incident", "weather_source", schema=SCHEMA)
    op.drop_column("incident", "weather_report", schema=SCHEMA)
    op.drop_column("incident", "weather_observed_at", schema=SCHEMA)
    op.drop_column("incident", "weather_station", schema=SCHEMA)
