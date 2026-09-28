"""Store actual manual arrival/departure separately from scheduled work.

Revision ID: d0e1f2a3b4c5
Revises: ds20260928
"""

import sqlalchemy as sa

from alembic import op

revision = "d0e1f2a3b4c5"
down_revision = "ds20260928"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "attendance_record",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "roster_assignment_id",
            sa.Uuid(),
            sa.ForeignKey("hr.roster_assignment.id"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column(
            "department_id",
            sa.String(),
            sa.ForeignKey("hr.department.id"),
            nullable=False,
        ),
        sa.Column("arrived_at", sa.DateTime(), nullable=False),
        sa.Column("departed_at", sa.DateTime(), nullable=True),
        sa.Column("break_minutes", sa.Integer(), nullable=False),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column(
            "workflow_instance_id",
            sa.Uuid(),
            sa.ForeignKey("hr.workflow_instance.id"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("roster_assignment_id", name="uq_hr_attendance_assignment"),
        schema="hr",
    )
    op.create_index(
        "hr_attendance_record_roster_assignment_id_idx",
        "attendance_record",
        ["roster_assignment_id"],
        schema="hr",
    )
    op.create_index(
        "hr_attendance_record_user_id_idx",
        "attendance_record",
        ["user_id"],
        schema="hr",
    )

    op.create_table(
        "attendance_correction",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "attendance_id",
            sa.Uuid(),
            sa.ForeignKey("hr.attendance_record.id"),
            nullable=False,
        ),
        sa.Column(
            "proposed_by_user_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False
        ),
        sa.Column("expected_revision", sa.Integer(), nullable=False),
        sa.Column("arrived_at", sa.DateTime(), nullable=False),
        sa.Column("departed_at", sa.DateTime(), nullable=False),
        sa.Column("break_minutes", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column(
            "workflow_instance_id",
            sa.Uuid(),
            sa.ForeignKey("hr.workflow_instance.id"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        schema="hr",
    )
    op.create_index(
        "hr_attendance_correction_attendance_id_idx",
        "attendance_correction",
        ["attendance_id"],
        schema="hr",
    )


def downgrade() -> None:
    op.drop_table("attendance_correction", schema="hr")
    op.drop_table("attendance_record", schema="hr")
