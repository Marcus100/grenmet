"""Canonical observation store and station-hour publish gate (ADR-0032).

Own schema ``observations`` next to the paper-register tables. Station 78958 is
seeded as ``automatic``: SURFACE publishes it (ADR-0010), so eRegister is
refused until the owner changes the schedule.
"""

from alembic import op

revision = "eregister_0003"
down_revision = "eregister_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA observations")
    op.execute("""
        CREATE TABLE observations.stations (
          station_id text PRIMARY KEY,
          wigos_id text,
          name text,
          schedule text NOT NULL DEFAULT 'automatic'
            CHECK (schedule IN ('automatic', 'manual', 'hybrid')),
          manual_hours_utc smallint[] NOT NULL DEFAULT '{}'
            CHECK (manual_hours_utc <@ ARRAY[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]::smallint[]),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        INSERT INTO observations.stations (station_id, wigos_id, name, schedule)
        VALUES ('78958', '0-20000-0-78958', 'Maurice Bishop International Airport', 'automatic')
    """)
    op.execute("""
        CREATE TABLE observations.observations (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          station_id text NOT NULL REFERENCES observations.stations (station_id),
          element text NOT NULL,
          valid_time_utc timestamptz NOT NULL,
          source text NOT NULL CHECK (source <> ''),
          value double precision,
          unit text,
          is_hourly boolean NOT NULL,
          received_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT observations_natural_key
            UNIQUE (station_id, element, valid_time_utc, source)
        )
    """)
    op.execute(
        "CREATE INDEX observations_station_time_idx ON observations.observations (station_id, valid_time_utc DESC)"
    )
    op.execute("""
        CREATE TABLE observations.publish_gate (
          station_id text NOT NULL REFERENCES observations.stations (station_id),
          valid_hour timestamptz NOT NULL CHECK (
            valid_hour = date_trunc('hour', valid_hour AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
          ),
          source text NOT NULL,
          observation_id uuid NOT NULL,
          claimed_by text,
          claimed_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (station_id, valid_hour)
        )
    """)
    op.execute("""
        CREATE TABLE observations.publish_gate_decisions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          station_id text NOT NULL,
          valid_hour timestamptz NOT NULL,
          requested_source text NOT NULL,
          official_source text,
          observation_id uuid,
          outcome text NOT NULL CHECK (outcome IN ('claimed', 'reused', 'refused')),
          reason text NOT NULL,
          decided_by text,
          decided_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        "CREATE INDEX publish_gate_decisions_hour_idx ON observations.publish_gate_decisions (station_id, valid_hour)"
    )


def downgrade() -> None:
    op.execute("DROP SCHEMA observations CASCADE")
