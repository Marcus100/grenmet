"""Bookings customers become a role of a contact (ADR-0028, party/role).

Destructive by design, and safe because nothing is live: ``bookings.customer``
loses ``name``, ``email``, ``email_hash``, ``phone`` and ``marketing_consent``
(they live only in ``org.contact``, with consent history) and ``contact_id``
becomes required with no ``ON DELETE SET NULL``. Customers that were never linked
to a contact cannot be migrated (the email hash needs the application secret), so
they and their bookings are deleted first. ``org.contact.email_hash`` becomes
nullable so a walk-in with no email address can still be a contact.

Revision ID: bookingspartyrole20261021
Revises: eventsschema20261021
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingspartyrole20261021"
down_revision = "eventsschema20261021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "contact",
        "email_hash",
        existing_type=sa.String(64),
        nullable=True,
        schema="org",
    )
    op.execute(
        "DELETE FROM bookings.booking WHERE customer_id IN "
        "(SELECT id FROM bookings.customer WHERE contact_id IS NULL)"
    )
    op.execute("DELETE FROM bookings.customer WHERE contact_id IS NULL")
    op.drop_constraint(
        "customer_contact_id_fkey", "customer", schema="bookings", type_="foreignkey"
    )
    op.alter_column(
        "customer",
        "contact_id",
        existing_type=sa.String(100),
        nullable=False,
        schema="bookings",
    )
    op.create_foreign_key(
        "customer_contact_id_fkey",
        "customer",
        "contact",
        ["contact_id"],
        ["id"],
        source_schema="bookings",
        referent_schema="org",
    )
    op.drop_index(
        "ix_customer_org_email_hash", table_name="customer", schema="bookings"
    )
    for column in ("name", "email", "email_hash", "phone", "marketing_consent"):
        op.drop_column("customer", column, schema="bookings")


def downgrade() -> None:
    op.add_column(
        "customer",
        sa.Column("name", sa.String(120), nullable=False, server_default=""),
        schema="bookings",
    )
    op.add_column("customer", sa.Column("email", sa.String(320)), schema="bookings")
    op.add_column("customer", sa.Column("email_hash", sa.String(64)), schema="bookings")
    op.add_column("customer", sa.Column("phone", sa.String(40)), schema="bookings")
    op.add_column(
        "customer",
        sa.Column(
            "marketing_consent", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        schema="bookings",
    )
    op.create_index(
        "ix_customer_org_email_hash",
        "customer",
        ["organisation_id", "email_hash"],
        schema="bookings",
    )
    op.drop_constraint(
        "customer_contact_id_fkey", "customer", schema="bookings", type_="foreignkey"
    )
    op.alter_column(
        "customer",
        "contact_id",
        existing_type=sa.String(100),
        nullable=True,
        schema="bookings",
    )
    op.create_foreign_key(
        "customer_contact_id_fkey",
        "customer",
        "contact",
        ["contact_id"],
        ["id"],
        source_schema="bookings",
        referent_schema="org",
        ondelete="SET NULL",
    )
    op.execute("DELETE FROM org.contact WHERE email_hash IS NULL")
    op.alter_column(
        "contact",
        "email_hash",
        existing_type=sa.String(64),
        nullable=False,
        schema="org",
    )
