"""Optional review, corrections and one live row per station-hour.

Additive on the eRegister chain only. The state enum is unchanged: existing
``accepted`` rows keep meaning accepted (the observer, or other register staff,
accepts alone). A second register staff member may record an optional review
(``reviewed`` or ``query`` with a note) on the row; it never blocks sending.
``supersedes_id`` (0001) carries the correction chain.

Before the partial unique index is built, duplicate live rows for one station,
time and kind are resolved by marking all but one ``superseded`` (an accepted
row wins, then the newest), so the migration cannot fail on old data.
"""

from alembic import op

revision = "eregister_0004"
down_revision = "eregister_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE register_observations ADD COLUMN review_outcome text")
    op.execute("ALTER TABLE register_observations ADD COLUMN review_note text")
    op.execute("ALTER TABLE register_observations ADD COLUMN reviewed_by text")
    op.execute("ALTER TABLE register_observations ADD COLUMN reviewed_at timestamptz")
    op.execute(
        "ALTER TABLE register_observations ADD CONSTRAINT register_observations_review_outcome"
        " CHECK (review_outcome IN ('reviewed', 'query'))"
    )
    op.execute(
        """
        UPDATE register_observations o
        SET state = 'superseded', updated_at = now()
        WHERE o.state NOT IN ('rejected', 'superseded')
          AND EXISTS (
            SELECT 1 FROM register_observations n
            WHERE n.station_id = o.station_id
              AND n.observed_at = o.observed_at
              AND n.kind = o.kind
              AND n.id <> o.id
              AND n.state NOT IN ('rejected', 'superseded')
              AND (
                (n.state = 'accepted') > (o.state = 'accepted')
                OR ((n.state = 'accepted') = (o.state = 'accepted')
                    AND (n.created_at, n.id::text) > (o.created_at, o.id::text))
              )
          )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX register_observations_live_key
        ON register_observations (station_id, observed_at, kind)
        WHERE state NOT IN ('rejected', 'superseded')
        """
    )
    op.execute(
        "CREATE INDEX register_observations_supersedes_idx ON register_observations (supersedes_id) WHERE supersedes_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX register_observations_state_time_idx ON register_observations (state, observed_at DESC)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX register_observations_state_time_idx")
    op.execute("DROP INDEX register_observations_supersedes_idx")
    op.execute("DROP INDEX register_observations_live_key")
    op.execute(
        "ALTER TABLE register_observations DROP CONSTRAINT register_observations_review_outcome"
    )
    op.execute("ALTER TABLE register_observations DROP COLUMN reviewed_at")
    op.execute("ALTER TABLE register_observations DROP COLUMN reviewed_by")
    op.execute("ALTER TABLE register_observations DROP COLUMN review_note")
    op.execute("ALTER TABLE register_observations DROP COLUMN review_outcome")
