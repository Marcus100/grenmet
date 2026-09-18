"""Create the manual observation register."""

from alembic import op

revision = "eregister_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE observation_kind AS ENUM ('SYNOP', 'METAR', 'SPECI')")
    op.execute(
        "CREATE TYPE register_state AS ENUM ('draft', 'qc_pending', 'accepted', 'rejected', 'superseded')"
    )
    op.execute("""
        CREATE TABLE register_observations (
          id uuid PRIMARY KEY,
          station_id text NOT NULL,
          station_name text,
          aerodrome_icao text,
          kind observation_kind NOT NULL,
          observed_at timestamptz NOT NULL,
          issued_at timestamptz,
          body jsonb NOT NULL,
          raw_tac text,
          bufr jsonb,
          iwxxm jsonb,
          state register_state NOT NULL DEFAULT 'draft',
          qc_notes text,
          wis2_topic text,
          wis2_message_id text,
          wis2_published_at timestamptz,
          supersedes_id uuid REFERENCES register_observations(id),
          actor_id text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        "CREATE INDEX register_observations_station_time_idx ON register_observations (station_id, observed_at DESC)"
    )
    op.execute(
        "CREATE INDEX register_observations_kind_time_idx ON register_observations (kind, observed_at DESC)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE register_observations")
    op.execute("DROP TYPE register_state")
    op.execute("DROP TYPE observation_kind")
