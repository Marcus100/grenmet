"""Printix offline scanning: the phone's time and reference on the scan log, and the close time.

Additive: two nullable columns on ``printix.scan_log``, a unique index on
``(pairing_id, client_ref)`` built concurrently, so a retried offline sync is
answered once, and a nullable ``closed_at`` on ``printix.event``. Existing rows keep
NULL (live scans; open events), and NULLs never collide in a unique index.

Revision ID: printixoffline20261115
Revises: authsessionemail20261115
"""

import sqlalchemy as sa

from alembic import op

revision = "printixoffline20261115"
down_revision = "authsessionemail20261115"
branch_labels = None
depends_on = None

SCHEMA = "printix"
INDEX = "scan_log_pairing_id_client_ref_idx"


def upgrade() -> None:
    op.add_column(
        "scan_log",
        sa.Column("offline_scanned_at", sa.DateTime(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "scan_log", sa.Column("client_ref", sa.Uuid(), nullable=True), schema=SCHEMA
    )
    op.add_column(
        "event", sa.Column("closed_at", sa.DateTime(), nullable=True), schema=SCHEMA
    )
    with op.get_context().autocommit_block():
        op.create_index(
            INDEX,
            "scan_log",
            ["pairing_id", "client_ref"],
            unique=True,
            schema=SCHEMA,
            postgresql_concurrently=True,
        )


def downgrade() -> None:
    # Transactional on purpose: migration tests run every later downgrade inside
    # one transaction they roll back.
    # migration-safety: drops only the index this revision added.
    op.execute(f'DROP INDEX IF EXISTS {SCHEMA}."{INDEX}"')
    op.drop_column("event", "closed_at", schema=SCHEMA)
    op.drop_column("scan_log", "client_ref", schema=SCHEMA)
    op.drop_column("scan_log", "offline_scanned_at", schema=SCHEMA)
