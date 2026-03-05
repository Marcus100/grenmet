"""phase 3 shift and roster domain

Revision ID: c103eec1aa03
Revises: c102eec1aa02
Create Date: 2026-03-05 17:45:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c103eec1aa03"
down_revision = "c102eec1aa02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "shift_catalog",
        sa.Column("code", sa.String(length=10), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("start_time", sa.String(length=5), nullable=True),
        sa.Column("end_time", sa.String(length=5), nullable=True),
        sa.Column("counts_as_work_hours", sa.Boolean(), nullable=False),
        sa.Column("needs_reason", sa.Boolean(), nullable=False),
        sa.Column("needs_approval", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("code"),
        schema="hr",
    )
    op.create_table(
        "roster_period",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("department_id", sa.String(length=100), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["department_id"], ["hr.department.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    op.create_table(
        "roster_assignment",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("roster_period_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("assignment_date", sa.Date(), nullable=False),
        sa.Column("shift_code", sa.String(length=10), nullable=False),
        sa.Column("remarks", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["roster_period_id"], ["hr.roster_period.id"]),
        sa.ForeignKeyConstraint(["shift_code"], ["hr.shift_catalog.code"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "assignment_date", name="uq_hr_roster_assignment_user_date"),
        schema="hr",
    )
    op.create_table(
        "roster_import_job",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("department_id", sa.String(length=100), nullable=False),
        sa.Column("roster_period_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("total_rows", sa.Integer(), nullable=False),
        sa.Column("valid_rows", sa.Integer(), nullable=False),
        sa.Column("invalid_rows", sa.Integer(), nullable=False),
        sa.Column("error_summary", sa.String(length=2000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["department_id"], ["hr.department.id"]),
        sa.ForeignKeyConstraint(["roster_period_id"], ["hr.roster_period.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    op.create_table(
        "roster_import_row",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("roster_import_job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("raw_data", sa.JSON(), nullable=False),
        sa.Column("validation_errors", sa.JSON(), nullable=False),
        sa.Column("is_valid", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["roster_import_job_id"], ["hr.roster_import_job.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )

    op.execute(
        """
        INSERT INTO hr.shift_catalog
        (code, label, category, start_time, end_time, counts_as_work_hours, needs_reason, needs_approval, is_active, created_at, updated_at)
        VALUES
          ('M','Morning','WORK','06:00','14:00',true,false,false,true, NOW(), NOW()),
          ('D','Day','WORK','08:00','16:00',true,false,false,true, NOW(), NOW()),
          ('E','Evening','WORK','14:00','22:00',true,false,false,true, NOW(), NOW()),
          ('N','Night','WORK','22:00','06:00',true,false,false,true, NOW(), NOW()),
          ('O','Off','OFF',NULL,NULL,false,false,false,true, NOW(), NOW()),
          ('V','Vacation','LEAVE',NULL,NULL,false,true,true,true, NOW(), NOW()),
          ('L','Leave','LEAVE',NULL,NULL,false,true,true,true, NOW(), NOW()),
          ('S','Sick','LEAVE',NULL,NULL,false,true,true,true, NOW(), NOW())
        ON CONFLICT (code) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_table("roster_import_row", schema="hr")
    op.drop_table("roster_import_job", schema="hr")
    op.drop_table("roster_assignment", schema="hr")
    op.drop_table("roster_period", schema="hr")
    op.drop_table("shift_catalog", schema="hr")
