"""phase 1 auth hr contract hardening

Revision ID: c101eec1aa01
Revises: b41f6fd5ec31
Create Date: 2026-03-05 17:20:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c101eec1aa01"
down_revision = "b41f6fd5ec31"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("permission", sa.Column("key", sa.String(length=120), nullable=True))
    op.execute(
        """
        UPDATE permission
        SET key = LOWER(entity || '.' || action)
        WHERE key IS NULL
        """
    )
    op.alter_column("permission", "key", nullable=False)
    op.create_unique_constraint("permission_key_key", "permission", ["key"])
    op.create_index("permission_key_idx", "permission", ["key"], unique=True)

    op.create_table(
        "user_role_assignment",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scope", sa.String(length=20), nullable=False),
        sa.Column("department_id", sa.String(length=100), nullable=True),
        sa.Column("effective_from", sa.DateTime(), nullable=False),
        sa.Column("effective_to", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["hr.department.id"]),
        sa.ForeignKeyConstraint(["role_id"], ["role.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "user_role_assignment_user_id_idx",
        "user_role_assignment",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "user_role_assignment_role_id_idx",
        "user_role_assignment",
        ["role_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("user_role_assignment_role_id_idx", table_name="user_role_assignment")
    op.drop_index("user_role_assignment_user_id_idx", table_name="user_role_assignment")
    op.drop_table("user_role_assignment")
    op.drop_index("permission_key_idx", table_name="permission")
    op.drop_constraint("permission_key_key", "permission", type_="unique")
    op.drop_column("permission", "key")
