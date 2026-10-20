"""Link booking customers to organisation contacts (PF3 wiring).

Additive. Adds nullable ``bookings.customer.contact_id`` referencing
``org.contact.id`` (``ON DELETE SET NULL``, so a merged-away contact never blocks
a booking) with an index. Nothing is backfilled: customers link on their next
booking, and only for organisations entitled to ``contacts``.

Revision ID: wiring20261020
Revises: reliability20261020
"""

import sqlalchemy as sa

from alembic import op

revision = "wiring20261020"
down_revision = "reliability20261020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "customer",
        sa.Column(
            "contact_id",
            sa.String(100),
            sa.ForeignKey("org.contact.id", ondelete="SET NULL"),
            nullable=True,
        ),
        schema="bookings",
    )
    op.create_index(
        "customer_contact_id_idx",
        "customer",
        ["contact_id"],
        schema="bookings",
    )


def downgrade() -> None:
    op.drop_index(
        "customer_contact_id_idx",
        table_name="customer",
        schema="bookings",
    )
    op.drop_column("customer", "contact_id", schema="bookings")
