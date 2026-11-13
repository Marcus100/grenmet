"""Terminal punch import (ADR-0040): device user mapping and imported punches.

Additive: two new tables in the ``hr`` schema. Existing attendance rows are untouched.

Revision ID: terminalpunch20261112
Revises: almanac20261109
"""

import sqlalchemy as sa

from alembic import op

revision = "terminalpunch20261112"
down_revision = "almanac20261109"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "terminal_user",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "department_id",
            sa.String(),
            sa.ForeignKey("hr.department.id"),
            nullable=False,
        ),
        sa.Column("device_user_id", sa.String(32), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column(
            "created_by_user_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "department_id", "device_user_id", name="uq_hr_terminal_user_device"
        ),
        sa.UniqueConstraint(
            "department_id", "user_id", name="uq_hr_terminal_user_person"
        ),
        schema="hr",
    )
    op.create_index(
        "ix_hr_terminal_user_user_id",
        "terminal_user",
        ["user_id"],
        schema="hr",
    )

    op.create_table(
        "terminal_punch",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "department_id",
            sa.String(),
            sa.ForeignKey("hr.department.id"),
            nullable=False,
        ),
        sa.Column("terminal", sa.String(60), nullable=False),
        sa.Column("device_user_id", sa.String(32), nullable=False),
        sa.Column("punched_at", sa.DateTime(), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id")),
        sa.Column(
            "roster_assignment_id",
            sa.Uuid(),
            sa.ForeignKey("hr.roster_assignment.id"),
        ),
        sa.Column("kind", sa.String(16)),
        sa.Column("outcome", sa.String(24), nullable=False),
        sa.Column("detail", sa.String(255)),
        sa.Column("import_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        # One row per device, terminal and punch time: re-running an export is a no-op.
        sa.UniqueConstraint(
            "department_id",
            "terminal",
            "device_user_id",
            "punched_at",
            name="uq_hr_terminal_punch_scan",
        ),
        schema="hr",
    )
    op.create_index(
        "ix_hr_terminal_punch_department_outcome",
        "terminal_punch",
        ["department_id", "outcome"],
        schema="hr",
    )
    op.create_index(
        "ix_hr_terminal_punch_import_id",
        "terminal_punch",
        ["import_id"],
        schema="hr",
    )
    op.create_index(
        "ix_hr_terminal_punch_user_id",
        "terminal_punch",
        ["user_id"],
        schema="hr",
    )


def downgrade() -> None:
    op.drop_table("terminal_punch", schema="hr")
    op.drop_table("terminal_user", schema="hr")
