"""Stores: catalogue, locations, stock ledger and requisitions.

Revision ID: stores20261017
Revises: platformorgs20261018
"""

import sqlalchemy as sa

from alembic import op

revision = "stores20261017"
down_revision = "platformorgs20261018"
branch_labels = None
depends_on = None

SCHEMA = "stores"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")

    op.create_table(
        "store_location",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("hr.organisation.id"),
            nullable=False,
        ),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "organisation_id", "code", name="uq_stores_store_location_org_code"
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_stores_store_location_organisation_id",
        "store_location",
        ["organisation_id"],
        schema=SCHEMA,
    )

    op.create_table(
        "item",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("hr.organisation.id"),
            nullable=False,
        ),
        sa.Column("sku", sa.String(60), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("unit", sa.String(30), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("organisation_id", "sku", name="uq_stores_item_org_sku"),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_stores_item_organisation_id", "item", ["organisation_id"], schema=SCHEMA
    )

    op.create_table(
        "stock_level",
        sa.Column(
            "item_id",
            sa.Uuid(),
            sa.ForeignKey("stores.item.id"),
            primary_key=True,
        ),
        sa.Column(
            "location_id",
            sa.Uuid(),
            sa.ForeignKey("stores.store_location.id"),
            primary_key=True,
        ),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("quantity >= 0", name="ck_stores_stock_level_quantity"),
        schema=SCHEMA,
    )

    op.create_table(
        "requisition",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("number", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("department_id", sa.String(100), nullable=False),
        sa.Column(
            "requester_user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("purpose", sa.String(500), nullable=True),
        sa.Column("needed_by", sa.Date(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column(
            "decided_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id"),
            nullable=True,
        ),
        sa.Column("decision_note", sa.String(500), nullable=True),
        sa.Column("delivered_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("number", name="requisition_number_key"),
        sa.ForeignKeyConstraint(
            ["department_id", "organisation_id"],
            ["hr.department.id", "hr.department.organisation_id"],
            name="fk_stores_requisition_department_org",
        ),
        sa.CheckConstraint(
            "status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED',"
            "'PARTIALLY_DELIVERED','DELIVERED','CANCELLED')",
            name="ck_stores_requisition_status",
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_stores_requisition_organisation_id",
        "requisition",
        ["organisation_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_stores_requisition_department_id",
        "requisition",
        ["department_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_stores_requisition_requester_user_id",
        "requisition",
        ["requester_user_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_stores_requisition_org_status",
        "requisition",
        ["organisation_id", "status"],
        schema=SCHEMA,
    )

    op.create_table(
        "requisition_line",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "requisition_id",
            sa.Uuid(),
            sa.ForeignKey("stores.requisition.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "item_id", sa.Uuid(), sa.ForeignKey("stores.item.id"), nullable=False
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("requested_quantity", sa.Integer(), nullable=False),
        sa.Column("approved_quantity", sa.Integer(), nullable=True),
        sa.Column("delivered_quantity", sa.Integer(), nullable=False),
        sa.UniqueConstraint(
            "requisition_id", "item_id", name="uq_stores_requisition_line_item"
        ),
        sa.CheckConstraint(
            "requested_quantity > 0", name="ck_stores_requisition_line_requested"
        ),
        sa.CheckConstraint(
            "approved_quantity IS NULL OR "
            "(approved_quantity >= 0 AND approved_quantity <= requested_quantity)",
            name="ck_stores_requisition_line_approved",
        ),
        sa.CheckConstraint(
            "delivered_quantity >= 0 AND delivered_quantity <= "
            "COALESCE(approved_quantity, 0)",
            name="ck_stores_requisition_line_delivered",
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_stores_requisition_line_requisition_id",
        "requisition_line",
        ["requisition_id"],
        schema=SCHEMA,
    )

    op.create_table(
        "stock_movement",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("hr.organisation.id"),
            nullable=False,
        ),
        sa.Column(
            "item_id", sa.Uuid(), sa.ForeignKey("stores.item.id"), nullable=False
        ),
        sa.Column(
            "location_id",
            sa.Uuid(),
            sa.ForeignKey("stores.store_location.id"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("quantity_delta", sa.Integer(), nullable=False),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(500), nullable=True),
        sa.Column(
            "requisition_id",
            sa.Uuid(),
            sa.ForeignKey("stores.requisition.id"),
            nullable=True,
        ),
        sa.Column(
            "created_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "quantity_delta <> 0", name="ck_stores_stock_movement_delta"
        ),
        sa.CheckConstraint(
            "balance_after >= 0", name="ck_stores_stock_movement_balance"
        ),
        sa.CheckConstraint(
            "kind IN ('RECEIPT','ISSUE','ADJUSTMENT')",
            name="ck_stores_stock_movement_kind",
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_stores_stock_movement_organisation_id",
        "stock_movement",
        ["organisation_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_stores_stock_movement_location_id",
        "stock_movement",
        ["location_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_stores_stock_movement_requisition_id",
        "stock_movement",
        ["requisition_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_stores_stock_movement_item_created",
        "stock_movement",
        ["item_id", "created_at"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("stock_movement", schema=SCHEMA)
    op.drop_table("requisition_line", schema=SCHEMA)
    op.drop_table("requisition", schema=SCHEMA)
    op.drop_table("stock_level", schema=SCHEMA)
    op.drop_table("item", schema=SCHEMA)
    op.drop_table("store_location", schema=SCHEMA)
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
