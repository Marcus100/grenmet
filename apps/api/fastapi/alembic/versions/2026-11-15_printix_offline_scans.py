"""Printix offline scanning: the phone's time and reference on the scan log.

Additive: two nullable columns on ``printix.scan_log`` and a unique index on
``(pairing_id, client_ref)``, built concurrently, so a retried offline sync is
answered once. Existing rows keep NULL in both (live scans), and NULLs never
collide in a unique index.

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
    with op.get_context().autocommit_block():
        op.drop_index(
            INDEX, table_name="scan_log", schema=SCHEMA, postgresql_concurrently=True
        )
    op.drop_column("scan_log", "client_ref", schema=SCHEMA)
    op.drop_column("scan_log", "offline_scanned_at", schema=SCHEMA)
