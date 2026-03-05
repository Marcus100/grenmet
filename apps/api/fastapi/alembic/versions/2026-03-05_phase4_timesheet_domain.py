"""phase 4 timesheet domain

Revision ID: c104eec1aa04
Revises: c103eec1aa03
Create Date: 2026-03-05 18:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c104eec1aa04"
down_revision = "c103eec1aa03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "department_policy",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("department_id", sa.String(length=100), nullable=False),
        sa.Column("allow_employee_self_submit", sa.Boolean(), nullable=False),
        sa.Column("allow_supervisor_proxy_submit", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["hr.department.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    op.create_unique_constraint(
        "department_policy_department_id_key",
        "department_policy",
        ["department_id"],
        schema="hr",
    )

    op.create_table(
        "timesheet",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("department_id", sa.String(length=100), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("submitted_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approved_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["department_id"], ["hr.department.id"]),
        sa.ForeignKeyConstraint(["submitted_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    op.create_table(
        "timesheet_entry",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("timesheet_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("roster_hours", sa.Numeric(5, 2), nullable=False),
        sa.Column("actual_hours", sa.Numeric(5, 2), nullable=False),
        sa.Column("break_hours", sa.Numeric(5, 2), nullable=False),
        sa.Column("comments", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["timesheet_id"], ["hr.timesheet.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    op.create_table(
        "timesheet_submission",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("timesheet_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("submitted_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("submission_mode", sa.String(length=20), nullable=False),
        sa.Column("submitted_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["submitted_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["timesheet_id"], ["hr.timesheet.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )


def downgrade() -> None:
    op.drop_table("timesheet_submission", schema="hr")
    op.drop_table("timesheet_entry", schema="hr")
    op.drop_table("timesheet", schema="hr")
    op.drop_constraint(
        "department_policy_department_id_key",
        "department_policy",
        type_="unique",
        schema="hr",
    )
    op.drop_table("department_policy", schema="hr")
