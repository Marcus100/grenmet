"""Track tropical systems across outlook issues.

``tropical_systems`` holds the GMS identity of a system from issue to issue.
``tropical_system_entries`` is a derived index of each outlook revision's
systems; ``tropical_systems.rebuild_entries`` recreates it from revisions.
"""

from alembic import op

revision = "wxproducts_0003"
down_revision = "wxproducts_0002"
branch_labels = None
depends_on = None

FEATURE_TYPES = (
    "'disturbance','tropical_wave','low_pressure_area',"
    "'low_pressure_centre','tropical_cyclone','other'"
)


def upgrade() -> None:
    op.execute(f"""CREATE TABLE tropical_systems (
        id uuid PRIMARY KEY,
        season smallint NOT NULL
            CONSTRAINT tropical_systems_season CHECK (season BETWEEN 2000 AND 2100),
        sequence smallint NOT NULL
            CONSTRAINT tropical_systems_sequence CHECK (sequence BETWEEN 1 AND 999),
        name text NOT NULL
            CONSTRAINT tropical_systems_name CHECK (length(name) BETWEEN 1 AND 300),
        feature_type text NOT NULL
            CONSTRAINT tropical_systems_feature_type CHECK (feature_type IN ({FEATURE_TYPES})),
        nhc_storm_id text,
        nhc_invest_id text,
        status text NOT NULL DEFAULT 'active'
            CONSTRAINT tropical_systems_status CHECK (status IN ('active','closed')),
        closed_reason text
            CONSTRAINT tropical_systems_closed_reason
            CHECK (closed_reason IN ('dissipated','merged','out_of_area','duplicate')),
        continued_as_id uuid
            CONSTRAINT tropical_systems_continued_as_fk REFERENCES tropical_systems(id),
        first_issued_at timestamptz,
        last_issued_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by text NOT NULL,
        updated_by text NOT NULL,
        CONSTRAINT tropical_systems_season_sequence_key UNIQUE (season, sequence),
        CONSTRAINT tropical_systems_closed_has_reason
            CHECK ((status = 'closed') = (closed_reason IS NOT NULL)),
        CONSTRAINT tropical_systems_not_continued_as_self
            CHECK (continued_as_id IS NULL OR continued_as_id <> id)
    )""")
    op.execute(
        "CREATE UNIQUE INDEX tropical_systems_nhc_storm_idx "
        "ON tropical_systems(nhc_storm_id) WHERE nhc_storm_id IS NOT NULL"
    )
    # NHC reuses invest numbers 90-99 within a season, so this is not unique.
    op.execute(
        "CREATE INDEX tropical_systems_nhc_invest_idx ON tropical_systems(nhc_invest_id)"
    )
    op.execute(
        "CREATE INDEX tropical_systems_status_season_idx ON tropical_systems(status, season)"
    )
    op.execute(f"""CREATE TABLE tropical_system_entries (
        id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        system_id uuid NOT NULL
            CONSTRAINT tropical_system_entries_system_fk REFERENCES tropical_systems(id),
        product_id uuid NOT NULL,
        revision integer NOT NULL,
        action text NOT NULL
            CONSTRAINT tropical_system_entries_action CHECK (action IN ('draft','publish')),
        issued_at timestamptz NOT NULL,
        name text NOT NULL,
        feature_type text NOT NULL
            CONSTRAINT tropical_system_entries_feature_type CHECK (feature_type IN ({FEATURE_TYPES})),
        latitude numeric(5,2)
            CONSTRAINT tropical_system_entries_latitude CHECK (latitude BETWEEN -90 AND 90),
        longitude numeric(6,2)
            CONSTRAINT tropical_system_entries_longitude CHECK (longitude BETWEEN -180 AND 180),
        movement_direction text,
        movement_speed_kt numeric(5,1)
            CONSTRAINT tropical_system_entries_movement_speed CHECK (movement_speed_kt >= 0),
        formation_48h smallint
            CONSTRAINT tropical_system_entries_formation_48h CHECK (formation_48h BETWEEN 0 AND 100),
        formation_7d smallint
            CONSTRAINT tropical_system_entries_formation_7d CHECK (formation_7d BETWEEN 0 AND 100),
        source_edition_ids uuid[] NOT NULL DEFAULT '{{}}',
        CONSTRAINT tropical_system_entries_revision_fk FOREIGN KEY (product_id, revision)
            REFERENCES authored_product_revisions(product_id, revision),
        CONSTRAINT tropical_system_entries_revision_system_key
            UNIQUE (product_id, revision, system_id)
    )""")
    op.execute(
        "CREATE INDEX tropical_system_entries_system_issued_idx "
        "ON tropical_system_entries(system_id, issued_at)"
    )


def downgrade() -> None:
    raise RuntimeError(
        "Tracked tropical systems are operational history; remove them only after "
        "an explicit retention review"
    )
