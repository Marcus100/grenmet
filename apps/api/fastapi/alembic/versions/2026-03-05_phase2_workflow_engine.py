"""phase 2 workflow engine

Revision ID: c102eec1aa02
Revises: c101eec1aa01
Create Date: 2026-03-05 17:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c102eec1aa02"
down_revision = "c101eec1aa01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workflow_template",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("department_id", sa.String(length=100), nullable=False),
        sa.Column("workflow_type", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"]),
        sa.ForeignKeyConstraint(["department_id"], ["hr.department.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    op.create_index(
        "workflow_template_department_id_idx",
        "workflow_template",
        ["department_id"],
        unique=False,
        schema="hr",
    )

    op.create_table(
        "workflow_step_template",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workflow_template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column("required_role_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("required_scope", sa.String(length=20), nullable=False),
        sa.Column("is_required", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["required_role_id"], ["role.id"]),
        sa.ForeignKeyConstraint(["workflow_template_id"], ["hr.workflow_template.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )

    op.create_table(
        "workflow_instance",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workflow_template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("department_id", sa.String(length=100), nullable=False),
        sa.Column("workflow_type", sa.String(length=40), nullable=False),
        sa.Column("entity_type", sa.String(length=100), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("requested_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("current_step_order", sa.Integer(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["hr.department.id"]),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["workflow_template_id"], ["hr.workflow_template.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    op.create_index(
        "workflow_instance_entity_id_idx",
        "workflow_instance",
        ["entity_id"],
        unique=False,
        schema="hr",
    )

    op.create_table(
        "workflow_step_instance",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workflow_instance_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column("required_role_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("required_scope", sa.String(length=20), nullable=False),
        sa.Column("is_required", sa.Boolean(), nullable=False),
        sa.Column("approver_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(length=20), nullable=True),
        sa.Column("comments", sa.String(length=1000), nullable=True),
        sa.Column("acted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["approver_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["required_role_id"], ["role.id"]),
        sa.ForeignKeyConstraint(["workflow_instance_id"], ["hr.workflow_instance.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )

    op.create_table(
        "approval_action_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workflow_instance_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "workflow_step_instance_id", postgresql.UUID(as_uuid=True), nullable=True
        ),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("comments", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(
            ["workflow_instance_id"],
            ["hr.workflow_instance.id"],
        ),
        sa.ForeignKeyConstraint(
            ["workflow_step_instance_id"],
            ["hr.workflow_step_instance.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )


def downgrade() -> None:
    op.drop_table("approval_action_log", schema="hr")
    op.drop_table("workflow_step_instance", schema="hr")
    op.drop_index("workflow_instance_entity_id_idx", table_name="workflow_instance", schema="hr")
    op.drop_table("workflow_instance", schema="hr")
    op.drop_table("workflow_step_template", schema="hr")
    op.drop_index("workflow_template_department_id_idx", table_name="workflow_template", schema="hr")
    op.drop_table("workflow_template", schema="hr")
