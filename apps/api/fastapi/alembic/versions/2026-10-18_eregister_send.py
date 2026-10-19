"""eRegister send log (email and WIS2 publication of observations).

Additive: one new table in the application database.

Revision ID: eregsend20261018
Revises: orginvite20261018
"""

import sqlalchemy as sa

from alembic import op

revision = "eregsend20261018"
down_revision = "orginvite20261018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "eregister_send",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("observation_id", sa.Uuid(), nullable=False),
        sa.Column("station_id", sa.String(64), nullable=False),
        sa.Column("observed_at", sa.DateTime(), nullable=False),
        sa.Column("target", sa.String(10), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("recipients", sa.Integer()),
        sa.Column("detail", sa.JSON(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_retry_at", sa.DateTime()),
        sa.Column("last_error", sa.String(1000)),
        sa.Column("sent_at", sa.DateTime()),
        sa.Column(
            "created_by",
            sa.Uuid(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "target IN ('email', 'wis2')", name=op.f("eregister_send_target_check")
        ),
        sa.CheckConstraint(
            "status IN ('queued', 'sent', 'failed')",
            name=op.f("eregister_send_status_check"),
        ),
    )
    op.create_index(
        "ix_eregister_send_observation",
        "eregister_send",
        ["observation_id", "created_at"],
    )
    op.create_index(
        "ix_eregister_send_due",
        "eregister_send",
        ["target", "status", "next_retry_at"],
    )


def downgrade() -> None:
    op.drop_table("eregister_send")
