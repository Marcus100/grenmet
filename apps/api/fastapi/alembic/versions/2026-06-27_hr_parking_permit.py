"""hr parking permit

Revision ID: 429042be8687
Revises: 52ef8a4c7d91
Create Date: 2026-06-27 21:21:32.719001

Adds the hr.parking_permit table (Vehicle Pass / Airport Security Parking Access
form), the hr.approval_authority.can_approve_parking flag, and the
PARKING_PERMIT value on the existing workflowtype enum.

Note: autogenerate also surfaced pre-existing CAP-domain drift (cap.* FKs/indexes)
which is intentionally NOT included here — it is unrelated to this change.
"""

import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "429042be8687"
down_revision = "52ef8a4c7d91"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # workflowtype enum already exists; add the new value (autogenerate misses this).
    # PG17 allows ADD VALUE inside a transaction as long as it is not used here.
    op.execute("ALTER TYPE workflowtype ADD VALUE IF NOT EXISTS 'PARKING_PERMIT'")

    op.create_table(
        "parking_permit",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("department_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("submitted_by_user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "company_name",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=True,
        ),
        sa.Column(
            "phone", sqlmodel.sql.sqltypes.AutoString(length=30), nullable=True
        ),
        sa.Column(
            "vehicle_registration_no",
            sqlmodel.sql.sqltypes.AutoString(length=50),
            nullable=False,
        ),
        sa.Column("vehicle_insurance_issue_date", sa.Date(), nullable=True),
        sa.Column("vehicle_insurance_expiry_date", sa.Date(), nullable=True),
        sa.Column(
            "action_requested",
            sa.Enum(
                "NEW_PERMIT",
                "ANNUAL_RENEWAL",
                "REPLACEMENT_LOST_STOLEN",
                "INFORMATION_CHANGE",
                "OTHER",
                name="parkingaction",
            ),
            nullable=False,
        ),
        sa.Column(
            "action_other_detail",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=True,
        ),
        sa.Column("fee_amount", sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column(
            "decal_number",
            sqlmodel.sql.sqltypes.AutoString(length=50),
            nullable=True,
        ),
        sa.Column("valid_from", sa.Date(), nullable=True),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("issued_by_user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "received_by",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=True,
        ),
        sa.Column("issued_at", sa.DateTime(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(
                "DRAFT",
                "SUBMITTED",
                "APPROVED",
                "REJECTED",
                "CANCELLED",
                name="requeststatus",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("workflow_instance_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["hr.department.id"],
            name=op.f("parking_permit_department_id_fkey"),
        ),
        sa.ForeignKeyConstraint(
            ["issued_by_user_id"],
            ["user.id"],
            name=op.f("parking_permit_issued_by_user_id_fkey"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["submitted_by_user_id"],
            ["user.id"],
            name=op.f("parking_permit_submitted_by_user_id_fkey"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
            name=op.f("parking_permit_user_id_fkey"),
        ),
        sa.ForeignKeyConstraint(
            ["workflow_instance_id"],
            ["hr.workflow_instance.id"],
            name=op.f("parking_permit_workflow_instance_id_fkey"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("parking_permit_pkey")),
        schema="hr",
    )
    op.create_index(
        op.f("hr_parking_permit_department_id_idx"),
        "parking_permit",
        ["department_id"],
        unique=False,
        schema="hr",
    )
    op.create_index(
        op.f("hr_parking_permit_user_id_idx"),
        "parking_permit",
        ["user_id"],
        unique=False,
        schema="hr",
    )

    op.add_column(
        "approval_authority",
        sa.Column(
            "can_approve_parking",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="hr",
    )
    op.alter_column(
        "approval_authority",
        "can_approve_parking",
        server_default=None,
        schema="hr",
    )


def downgrade() -> None:
    op.drop_column("approval_authority", "can_approve_parking", schema="hr")
    op.drop_index(
        op.f("hr_parking_permit_user_id_idx"),
        table_name="parking_permit",
        schema="hr",
    )
    op.drop_index(
        op.f("hr_parking_permit_department_id_idx"),
        table_name="parking_permit",
        schema="hr",
    )
    op.drop_table("parking_permit", schema="hr")
    op.execute("DROP TYPE IF EXISTS parkingaction")
    # Note: the PARKING_PERMIT value on the workflowtype enum is intentionally not
    # removed — PostgreSQL does not support removing enum values.
