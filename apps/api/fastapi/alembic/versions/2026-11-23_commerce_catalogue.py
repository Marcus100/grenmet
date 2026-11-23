"""Commerce catalogue: products and price history (ADR-0063, slice 0).

Additive: a new ``commerce`` schema with ``product`` and ``price``. Nothing else
in the database changes. A trigger makes ``commerce.price`` append-only (ADR-0063
section 3, as ADR-0027's rewards ledger): UPDATE is refused, and DELETE is allowed
only when the owning organisation no longer exists (erasure cascade). ``price``
keeps ``created_by`` as a plain id, with no foreign key, so user deletion never
updates a price row. Products are deleted only through the organisation cascade.

Revision ID: commerce20261123
Revises: billingappstrial20261123
"""

import sqlalchemy as sa

from alembic import op

revision = "commerce20261123"
down_revision = "billingappstrial20261123"
branch_labels = None
depends_on = None

SCHEMA = "commerce"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    op.create_table(
        "product",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("base_unit", sa.String(length=20), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "base_unit IN ('each', 'kg', 'g', 'l', 'ml')",
            name=op.f("product_base_unit_values_check"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["user.id"],
            name=op.f("product_created_by_fkey"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name=op.f("product_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("product_pkey")),
        sa.UniqueConstraint(
            "organisation_id", "name", name=op.f("product_organisation_id_key")
        ),
        schema=SCHEMA,
    )
    op.create_index(
        op.f("commerce_product_organisation_id_idx"),
        "product",
        ["organisation_id"],
        unique=False,
        schema=SCHEMA,
    )
    op.create_table(
        "price",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("effective_from", sa.DateTime(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "currency IN ('XCD')", name=op.f("price_currency_values_check")
        ),
        sa.CheckConstraint(
            "amount_minor >= 0 AND amount_minor <= 10000000000",
            name=op.f("price_amount_range_check"),
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name=op.f("price_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            [f"{SCHEMA}.product.id"],
            name=op.f("price_product_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("price_pkey")),
        sa.UniqueConstraint(
            "product_id", "effective_from", name=op.f("price_product_id_key")
        ),
        schema=SCHEMA,
    )
    op.create_index(
        op.f("commerce_price_organisation_id_idx"),
        "price",
        ["organisation_id"],
        unique=False,
        schema=SCHEMA,
    )
    op.create_index(
        op.f("commerce_price_product_id_idx"),
        "price",
        ["product_id"],
        unique=False,
        schema=SCHEMA,
    )
    op.execute(
        """
        CREATE FUNCTION commerce.price_is_append_only() RETURNS trigger AS $$
        BEGIN
          -- Erasing an organisation cascades to its prices after the organisation
          -- row is gone; only that case may delete a price row.
          IF TG_OP = 'DELETE' AND NOT EXISTS (
            SELECT 1 FROM org.organisation WHERE id = OLD.organisation_id
          ) THEN
            RETURN OLD;
          END IF;
          RAISE EXCEPTION 'commerce.price is append-only';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER price_append_only
          BEFORE UPDATE OR DELETE ON commerce.price
          FOR EACH ROW EXECUTE FUNCTION commerce.price_is_append_only();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER price_append_only ON commerce.price")
    op.execute("DROP FUNCTION commerce.price_is_append_only()")
    op.drop_index(
        op.f("commerce_price_product_id_idx"), table_name="price", schema=SCHEMA
    )
    op.drop_index(
        op.f("commerce_price_organisation_id_idx"), table_name="price", schema=SCHEMA
    )
    op.drop_table("price", schema=SCHEMA)
    op.drop_index(
        op.f("commerce_product_organisation_id_idx"),
        table_name="product",
        schema=SCHEMA,
    )
    op.drop_table("product", schema=SCHEMA)
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
