"""department calendar events

Revision ID: e7a3d1c9b4f8
Revises: d5f2c8a4b1e6
Create Date: 2026-09-05

Adds hr.calendar_event: the department's own calendar — meetings, training,
inspections, visits, maintenance windows, deadlines and anything else staff
record as important. Any member of staff may add an entry; the author may edit
or cancel their own, and calendar.manage covers everyone else's.

The duty roster is a separate layer read onto the same calendar from
hr.roster_assignment; shifts are never copied into this table.

starts_at/ends_at are naive department-local wall-clock times, the same frame
the shift catalog uses, so one calendar never mixes two time bases. Entries are
cancelled (cancelled_at) rather than deleted — a calendar is a record.
"""

import sqlalchemy as sa

from alembic import op

revision = "e7a3d1c9b4f8"
down_revision = "d5f2c8a4b1e6"
branch_labels = None
depends_on = None

KIND = sa.Enum(
    "MEETING",
    "TRAINING",
    "INSPECTION",
    "VISIT",
    "MAINTENANCE",
    "OBSERVANCE",
    "DEADLINE",
    "OTHER",
    name="calendareventkind",
)


def upgrade() -> None:
    op.create_table(
        "calendar_event",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("department_id", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=True),
        sa.Column("kind", KIND, nullable=False),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=False),
        sa.Column("all_day", sa.Boolean(), nullable=False),
        sa.Column("location", sa.String(length=200), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["department_id"], ["hr.department.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        schema="hr",
    )
    op.create_index(
        "ix_hr_calendar_event_department_id",
        "calendar_event",
        ["department_id"],
        unique=False,
        schema="hr",
    )
    op.create_index(
        "ix_hr_calendar_event_starts_at",
        "calendar_event",
        ["starts_at"],
        unique=False,
        schema="hr",
    )
    op.create_index(
        op.f("ix_hr_calendar_event_created_by_user_id"),
        "calendar_event",
        ["created_by_user_id"],
        unique=False,
        schema="hr",
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_hr_calendar_event_created_by_user_id"),
        table_name="calendar_event",
        schema="hr",
    )
    op.drop_index(
        "ix_hr_calendar_event_starts_at", table_name="calendar_event", schema="hr"
    )
    op.drop_index(
        "ix_hr_calendar_event_department_id", table_name="calendar_event", schema="hr"
    )
    op.drop_table("calendar_event", schema="hr")
    KIND.drop(op.get_bind(), checkfirst=True)
