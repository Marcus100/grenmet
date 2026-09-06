"""Require approval for self-registered staff accounts."""

import sqlalchemy as sa

from alembic import op

revision = "b2c4d6e8f0a1"
down_revision = "a1b3c5d7e9f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column(
            "registration_pending",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    pending = (
        op.get_bind()
        .execute(sa.text('SELECT count(*) FROM "user" WHERE registration_pending'))
        .scalar()
    )
    if pending:
        raise RuntimeError(
            "Resolve pending registrations before removing approval protection"
        )
    op.drop_column("user", "registration_pending")
