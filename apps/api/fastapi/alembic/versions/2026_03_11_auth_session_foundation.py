"""auth session foundation

Revision ID: 8f2cc7b3e0f1
Revises: c7e2f4a1b9d3
Create Date: 2026-03-11

Adds persisted-session lifecycle metadata needed for opaque web sessions.
"""

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision = "8f2cc7b3e0f1"
down_revision = "c7e2f4a1b9d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "session",
        sa.Column(
            "client_type",
            sqlmodel.sql.sqltypes.AutoString(length=50),
            nullable=True,
        ),
    )
    op.add_column(
        "session",
        sa.Column(
            "app_name",
            sqlmodel.sql.sqltypes.AutoString(length=100),
            nullable=True,
        ),
    )
    op.add_column(
        "session",
        sa.Column(
            "user_agent",
            sqlmodel.sql.sqltypes.AutoString(length=500),
            nullable=True,
        ),
    )
    op.add_column(
        "session",
        sa.Column(
            "ip_address",
            sqlmodel.sql.sqltypes.AutoString(length=64),
            nullable=True,
        ),
    )
    op.add_column(
        "session",
        sa.Column(
            "last_used_at",
            sa.DateTime(),
            nullable=True,
        ),
    )
    op.add_column(
        "session",
        sa.Column(
            "revoked_at",
            sa.DateTime(),
            nullable=True,
        ),
    )

    op.execute("UPDATE session SET client_type = 'web' WHERE client_type IS NULL")
    op.execute(
        "UPDATE session SET last_used_at = updated_at WHERE last_used_at IS NULL"
    )

    op.alter_column(
        "session",
        "client_type",
        existing_type=sqlmodel.sql.sqltypes.AutoString(length=50),
        nullable=False,
    )
    op.alter_column(
        "session",
        "last_used_at",
        existing_type=sa.DateTime(),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column("session", "revoked_at")
    op.drop_column("session", "last_used_at")
    op.drop_column("session", "ip_address")
    op.drop_column("session", "user_agent")
    op.drop_column("session", "app_name")
    op.drop_column("session", "client_type")
