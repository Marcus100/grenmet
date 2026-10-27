"""Station registry: source kind, active flag, unique WIGOS identifier.

Additive on the eRegister chain only (ADR-0032 amendment).

* ``source_kind`` (``manual`` observer station or ``automatic`` weather station)
  is stored next to the existing ``schedule``; existing rows keep their schedule
  and get the kind it implies (an ``automatic`` schedule is an automatic station).
* ``active`` lets staff retire a station without deleting it (observations and
  gate rows reference it); the publish gate refuses an inactive station.
* A check keeps ``source_kind`` and ``schedule`` consistent.
* A partial unique index keeps one station per WIGOS identifier. Rows without
  one stay allowed; nothing is invented for them.
"""

from alembic import op

revision = "eregister_0007"
down_revision = "eregister_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE observations.stations ADD COLUMN source_kind text NOT NULL"
        " DEFAULT 'manual' CHECK (source_kind IN ('manual', 'automatic'))"
    )
    op.execute(
        "ALTER TABLE observations.stations"
        " ADD COLUMN active boolean NOT NULL DEFAULT true"
    )
    op.execute(
        "UPDATE observations.stations SET source_kind = 'automatic'"
        " WHERE schedule = 'automatic'"
    )
    op.execute(
        "ALTER TABLE observations.stations ADD CONSTRAINT stations_kind_matches_schedule"
        " CHECK ((source_kind = 'automatic') = (schedule = 'automatic'))"
    )
    op.execute(
        "CREATE UNIQUE INDEX stations_wigos_id_key"
        " ON observations.stations (wigos_id) WHERE wigos_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX observations.stations_wigos_id_key")
    op.execute(
        "ALTER TABLE observations.stations DROP CONSTRAINT stations_kind_matches_schedule"
    )
    op.execute("ALTER TABLE observations.stations DROP COLUMN active")
    op.execute("ALTER TABLE observations.stations DROP COLUMN source_kind")
