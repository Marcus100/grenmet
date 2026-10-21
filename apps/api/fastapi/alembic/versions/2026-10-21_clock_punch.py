"""Phone clock punches awaiting supervisor approval (ADR-0040).

Additive: one new table, ``hr.clock_punch``. Existing attendance rows are untouched.

Revision ID: clockpunch20261021
Revises: bookingsgrantscontacts20261021
"""

import sqlalchemy as sa

from alembic import op

revision = "clockpunch20261021"
down_revision = "bookingsgrantscontacts20261021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clock_punch",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column(
            "department_id",
            sa.String(),
            sa.ForeignKey("hr.department.id"),
            nullable=False,
        ),
        sa.Column(
            "clock_site_id",
            sa.Uuid(),
            sa.ForeignKey("hr.clock_site.id"),
            nullable=False,
        ),
        sa.Column(
            "roster_assignment_id",
            sa.Uuid(),
            sa.ForeignKey("hr.roster_assignment.id"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("punched_at", sa.DateTime(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("reviewed_by_user_id", sa.Uuid(), sa.ForeignKey("user.id")),
        sa.Column("reviewed_at", sa.DateTime()),
        sa.Column("review_note", sa.String(500)),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        schema="hr",
    )
    op.create_index(
        "ix_hr_clock_punch_user_id", "clock_punch", ["user_id"], schema="hr"
    )
    op.create_index(
        "ix_hr_clock_punch_roster_assignment_id",
        "clock_punch",
        ["roster_assignment_id"],
        schema="hr",
    )
    op.create_index(
        "ix_hr_clock_punch_status_department",
        "clock_punch",
        ["status", "department_id"],
        schema="hr",
    )


def downgrade() -> None:
    op.drop_table("clock_punch", schema="hr")
