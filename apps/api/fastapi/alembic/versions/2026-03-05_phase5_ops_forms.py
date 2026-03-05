"""phase 5 operational request forms

Revision ID: c105eec1aa05
Revises: c104eec1aa04
Create Date: 2026-03-05 18:15:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c105eec1aa05"
down_revision = "c104eec1aa04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "leave_request",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("department_id", sa.String(length=100), nullable=False),
        sa.Column("leave_type", sa.String(length=30), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("days_requested", sa.Numeric(6, 2), nullable=False),
        sa.Column("reason", sa.String(length=1000), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("workflow_instance_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["hr.department.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["workflow_instance_id"], ["hr.workflow_instance.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    op.create_table(
        "leave_balance_event",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("leave_type", sa.String(length=30), nullable=False),
        sa.Column("delta_days", sa.Numeric(6, 2), nullable=False),
        sa.Column("balance_after_days", sa.Numeric(6, 2), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.Column("related_leave_request_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["related_leave_request_id"], ["hr.leave_request.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    op.create_table(
        "shift_swap_request",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("requesting_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("counterpart_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("department_id", sa.String(length=100), nullable=False),
        sa.Column("source_date", sa.Date(), nullable=False),
        sa.Column("source_shift_code", sa.String(length=10), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=False),
        sa.Column("target_shift_code", sa.String(length=10), nullable=False),
        sa.Column("reason", sa.String(length=1000), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("workflow_instance_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["counterpart_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["department_id"], ["hr.department.id"]),
        sa.ForeignKeyConstraint(["requesting_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["workflow_instance_id"], ["hr.workflow_instance.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    op.create_table(
        "absentee_report",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("department_id", sa.String(length=100), nullable=False),
        sa.Column("report_date", sa.Date(), nullable=False),
        sa.Column("reason_code", sa.String(length=60), nullable=False),
        sa.Column("notes", sa.String(length=1000), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("workflow_instance_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("submitted_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["hr.department.id"]),
        sa.ForeignKeyConstraint(["submitted_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["workflow_instance_id"], ["hr.workflow_instance.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    op.create_table(
        "status_report",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("department_id", sa.String(length=100), nullable=False),
        sa.Column("report_date", sa.Date(), nullable=False),
        sa.Column("shift_code", sa.String(length=10), nullable=False),
        sa.Column("submitted_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("weather_summary", sa.String(length=1000), nullable=True),
        sa.Column("equipment_summary", sa.String(length=1000), nullable=True),
        sa.Column("personnel_summary", sa.String(length=1000), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("workflow_instance_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["hr.department.id"]),
        sa.ForeignKeyConstraint(["submitted_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["workflow_instance_id"], ["hr.workflow_instance.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )


def downgrade() -> None:
    op.drop_table("status_report", schema="hr")
    op.drop_table("absentee_report", schema="hr")
    op.drop_table("shift_swap_request", schema="hr")
    op.drop_table("leave_balance_event", schema="hr")
    op.drop_table("leave_request", schema="hr")
