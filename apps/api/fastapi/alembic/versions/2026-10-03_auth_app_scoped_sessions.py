"""App-scoped sessions: phone sign-in fields and a session app index.

Additive only. Phone numbers are optional, unique when present, and stored in
E.164 form. See ADR-0016.

Revision ID: appscope20261003
Revises: signed20260928
"""

import sqlalchemy as sa

from alembic import op

revision = "appscope20261003"
down_revision = "signed20260928"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("phone_e164", sa.String(length=20), nullable=True))
    op.add_column("user", sa.Column("phone_verified_at", sa.DateTime(), nullable=True))
    op.create_index("ix_user_phone_e164", "user", ["phone_e164"], unique=True)
    op.create_index("ix_session_app_name", "session", ["app_name"])


def downgrade() -> None:
    op.drop_index("ix_session_app_name", table_name="session")
    op.drop_index("ix_user_phone_e164", table_name="user")
    op.drop_column("user", "phone_verified_at")
    op.drop_column("user", "phone_e164")
