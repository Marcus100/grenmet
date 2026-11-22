"""Index audit_entry on (created_at, id) for the global admin audit log.

Additive: one non-blocking index (CREATE INDEX CONCURRENTLY) on the application
database. The keyset page of ``GET /api/v1/audit/admin/entries`` orders the whole
append-only table by (created_at desc, id desc); without this index every page
sorts the full table. The per-record index ``ix_audit_entry_entity`` does not help
a global order. The downgrade drops the index only, never data.

Revision ID: auditentrycreated20261122
Revises: paymentsconnect20261121
"""

from alembic import op

revision = "auditentrycreated20261122"
down_revision = "paymentsconnect20261121"
branch_labels = None
depends_on = None

INDEX = "ix_audit_entry_created_id"
TABLE = "audit_entry"


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.create_index(
            INDEX,
            TABLE,
            ["created_at", "id"],
            postgresql_concurrently=True,
        )


def downgrade() -> None:
    op.drop_index(INDEX, table_name=TABLE)
