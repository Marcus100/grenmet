"""Retain the authority behind delegated HR grants.

Revision ID: delegation20261007
Revises: mailbox20261007
"""

import sqlalchemy as sa

from alembic import op

revision = "delegation20261007"
down_revision = "mailbox20261007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No cascading FK: revoked sources must leave inactive grants as evidence,
    # preventing a legacy user_role link from becoming effective again.
    op.add_column(
        "user_role_assignment",
        sa.Column("authority_assignment_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        "ix_user_role_assignment_authority_assignment_id",
        "user_role_assignment",
        ["authority_assignment_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_user_role_assignment_authority_assignment_id",
        table_name="user_role_assignment",
    )
    op.drop_column("user_role_assignment", "authority_assignment_id")
