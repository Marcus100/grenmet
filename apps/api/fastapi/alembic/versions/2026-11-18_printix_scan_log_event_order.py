"""Printix scan log: an index for "this gate phone's scans, newest first" (#1555).

The organiser dashboard lists an event's scans newest first by the time the scan
happened at the gate: ``COALESCE(offline_scanned_at, scanned_at)``. A scan reaches
its event through its pairing, and the existing index is ``(pairing_id, scanned_at)``,
which cannot serve that expression. This adds ``(pairing_id, happened_at, id)``
on the same expression, so the query can read the newest rows (a backward index scan) of each of the event's
gate phones straight from the index (a lateral top-N per pairing) instead of sorting
every scan of the event on each poll.

Additive: one index, no data change. Built inside the migration transaction: the
table holds one row per scan (thousands per event, purged 90 days after close).

Revision ID: printixscanlogorder20261118
Revises: authsessionsignedin20261116
"""

from alembic import op

revision = "printixscanlogorder20261118"
down_revision = "authsessionsignedin20261116"
branch_labels = None
depends_on = None

SCHEMA = "printix"
INDEX = "scan_log_pairing_id_happened_at_idx"


def upgrade() -> None:
    op.execute(
        # migration-safety: one index on a small table, built in the migration transaction.
        f'CREATE INDEX IF NOT EXISTS "{INDEX}" ON {SCHEMA}.scan_log '
        "(pairing_id, (COALESCE(offline_scanned_at, scanned_at)), id)"
    )


def downgrade() -> None:
    # migration-safety: drops only the index this revision added.
    op.execute(f'DROP INDEX IF EXISTS {SCHEMA}."{INDEX}"')
