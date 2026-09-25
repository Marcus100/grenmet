"""Order the leave ledger and allow one approval debit per request.

Adds ``entry_kind`` and a per-(user, leave type) ``sequence`` to
``hr.leave_balance_event``, backfilled from existing rows. Existing duplicate
approval debits stop the migration before any DDL: they are evidence for HR
to reconcile, not rows to delete.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
"""

import sqlalchemy as sa

from alembic import op

revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    duplicates = (
        bind.execute(
            sa.text(
                "SELECT related_leave_request_id FROM hr.leave_balance_event "
                "WHERE related_leave_request_id IS NOT NULL "
                "GROUP BY related_leave_request_id HAVING count(*) > 1"
            )
        )
        .scalars()
        .all()
    )
    if duplicates:
        raise RuntimeError(
            "Leave requests with more than one ledger debit need HR reconciliation "
            f"before this migration. IDs: {', '.join(str(i) for i in duplicates)}"
        )

    op.add_column(
        "leave_balance_event",
        sa.Column("entry_kind", sa.String(length=20), nullable=True),
        schema="hr",
    )
    op.add_column(
        "leave_balance_event",
        sa.Column("sequence", sa.Integer(), nullable=True),
        schema="hr",
    )
    op.execute(
        """
        UPDATE hr.leave_balance_event AS e
        SET sequence = ordered.position,
            entry_kind = CASE
                WHEN e.related_leave_request_id IS NOT NULL THEN 'APPROVAL_DEBIT'
                WHEN ordered.position = 1 THEN 'OPENING'
                ELSE 'ADJUSTMENT'
            END
        FROM (
            SELECT id, row_number() OVER (
                PARTITION BY user_id, leave_type ORDER BY created_at, id
            ) AS position
            FROM hr.leave_balance_event
        ) AS ordered
        WHERE ordered.id = e.id
        """
    )
    op.alter_column("leave_balance_event", "entry_kind", nullable=False, schema="hr")
    op.alter_column("leave_balance_event", "sequence", nullable=False, schema="hr")
    op.create_unique_constraint(
        "uq_hr_leave_balance_event_user_type_sequence",
        "leave_balance_event",
        ["user_id", "leave_type", "sequence"],
        schema="hr",
    )
    op.create_index(
        "uq_hr_leave_balance_event_approval_debit",
        "leave_balance_event",
        ["related_leave_request_id"],
        unique=True,
        schema="hr",
        postgresql_where=sa.text("entry_kind = 'APPROVAL_DEBIT'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_hr_leave_balance_event_approval_debit",
        table_name="leave_balance_event",
        schema="hr",
    )
    op.drop_constraint(
        "uq_hr_leave_balance_event_user_type_sequence",
        "leave_balance_event",
        schema="hr",
        type_="unique",
    )
    op.drop_column("leave_balance_event", "sequence", schema="hr")
    op.drop_column("leave_balance_event", "entry_kind", schema="hr")
