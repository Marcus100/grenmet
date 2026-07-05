"""cap job_event next_retry_at

Revision ID: b1d4f7a9c2e0
Revises: e6a8c0d2f4b6
Create Date: 2026-07-04

Adds cap.job_event.next_retry_at so the worker can pace FAILED-job retries with
exponential backoff instead of re-selecting them on every poll. Schema-only.
"""

import sqlalchemy as sa

from alembic import op

revision = "b1d4f7a9c2e0"
down_revision = "e6a8c0d2f4b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "job_event",
        sa.Column("next_retry_at", sa.DateTime(), nullable=True),
        schema="cap",
    )


def downgrade() -> None:
    op.drop_column("job_event", "next_retry_at", schema="cap")
