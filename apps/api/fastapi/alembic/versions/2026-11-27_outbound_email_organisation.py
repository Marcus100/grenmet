"""The business a delivery-log email was sent for (contact erasure scope, #1963).

Additive, nothing backfilled. ``outbound_email.organisation_id`` is nullable: rows
written before this column keep NULL, because nothing records which business queued
them, and contact erasure leaves NULL rows alone rather than guess. No retention purge
reaches ``outbound_email`` yet, so they persist until a retention decision covers them.
The index serves the erasure lookup by organisation.

The index is built concurrently: ``outbound_email`` is written on every send.

Revision ID: outboundemailorg20261127
Revises: contactvariant20261127
"""

import sqlalchemy as sa

from alembic import op

revision = "outboundemailorg20261127"
down_revision = "contactvariant20261127"
branch_labels = None
depends_on = None

#: Final name (``op.f``) so it matches the model's ``sa.Index`` name.
ORG_INDEX = "ix_outbound_email_organisation_id"


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "outbound_email",
        sa.Column("organisation_id", sa.String(length=100), nullable=True),
    )
    with op.get_context().autocommit_block():
        op.create_index(
            op.f(ORG_INDEX),
            "outbound_email",
            ["organisation_id"],
            postgresql_concurrently=True,
        )


def downgrade() -> None:
    op.drop_index(op.f(ORG_INDEX), table_name="outbound_email")
    op.drop_column("outbound_email", "organisation_id")
