"""Append-only cancellation evidence for recorded leave debits.

Revision ID: reversal20260928
Revises: staff20260928
"""

import sqlalchemy as sa

from alembic import op

revision = "reversal20260928"
down_revision = "staff20260928"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "leave_balance_event",
        "entry_kind",
        type_=sa.String(24),
        existing_type=sa.String(20),
        existing_nullable=False,
        schema="hr",
    )
    op.create_index(
        "uq_hr_leave_balance_event_cancellation_reversal",
        "leave_balance_event",
        ["related_leave_request_id"],
        unique=True,
        schema="hr",
        postgresql_where=sa.text("entry_kind = 'CANCELLATION_REVERSAL'"),
    )


def downgrade() -> None:
    if op.get_bind().scalar(
        sa.text(
            "SELECT EXISTS(SELECT 1 FROM hr.leave_balance_event WHERE entry_kind = 'CANCELLATION_REVERSAL')"
        )
    ):
        raise RuntimeError(
            "Cannot downgrade while reversal evidence exists; retain immutable HR history"
        )
    op.drop_index(
        "uq_hr_leave_balance_event_cancellation_reversal",
        table_name="leave_balance_event",
        schema="hr",
    )
    op.alter_column(
        "leave_balance_event",
        "entry_kind",
        type_=sa.String(20),
        existing_type=sa.String(24),
        existing_nullable=False,
        schema="hr",
    )
