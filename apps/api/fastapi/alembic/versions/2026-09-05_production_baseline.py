"""Durable staff identity, bootstrap tracking, and verified authentication.

Revision ID: f9b2c4d6e8a0
Revises: e7a3d1c9b4f8
"""

import sqlalchemy as sa

from alembic import op

revision = "f9b2c4d6e8a0"
down_revision = "e7a3d1c9b4f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "alert",
        sa.Column(
            "allow_self_approval",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        schema="cap",
    )
    op.add_column("user", sa.Column("email_verified_at", sa.DateTime(), nullable=True))
    op.add_column(
        "user",
        sa.Column(
            "email_verification_required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "user",
        sa.Column(
            "password_setup_pending",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_table(
        "baseline_step",
        sa.Column("key", sa.String(150), primary_key=True),
        sa.Column("completed_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "staff_credential",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id"), primary_key=True),
        sa.Column("number", sa.String(36), nullable=False, unique=True),
        sa.Column(
            "department_id",
            sa.String(100),
            sa.ForeignKey("hr.department.id"),
            nullable=False,
        ),
        sa.Column(
            "grade_id", sa.String(120), sa.ForeignKey("hr.grade.id"), nullable=False
        ),
        sa.Column("revoked_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "baseline_audit",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("actor_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("subject_id", sa.Uuid(), sa.ForeignKey("user.id")),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "approval_policy",
        sa.Column("key", sa.String(150), primary_key=True),
        sa.Column("allow_self_approval", sa.Boolean(), nullable=False),
        sa.Column("require_distinct_approvers", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "auth_challenge",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("purpose", sa.String(30), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id")),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
    )
    op.create_table(
        "external_identity",
        sa.Column("subject", sa.String(255), primary_key=True),
        sa.Column("provider", sa.String(30), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
    )
    op.create_index("ix_external_identity_user_id", "external_identity", ["user_id"])
    op.add_column(
        "workflow_instance",
        sa.Column(
            "allow_self_approval",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        schema="hr",
    )
    op.add_column(
        "workflow_instance",
        sa.Column(
            "require_distinct_approvers",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="hr",
    )


def downgrade() -> None:
    op.drop_column("alert", "allow_self_approval", schema="cap")
    op.drop_column("workflow_instance", "require_distinct_approvers", schema="hr")
    op.drop_column("workflow_instance", "allow_self_approval", schema="hr")
    for table in (
        "external_identity",
        "auth_challenge",
        "approval_policy",
        "baseline_audit",
        "staff_credential",
        "baseline_step",
    ):
        op.drop_table(table)
    for name in (
        "password_setup_pending",
        "email_verification_required",
        "email_verified_at",
    ):
        op.drop_column("user", name)
