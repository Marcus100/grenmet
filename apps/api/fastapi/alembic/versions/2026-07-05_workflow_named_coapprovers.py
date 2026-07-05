"""workflow named co-approvers

Revision ID: c3e5a1b7d9f2
Revises: b1d4f7a9c2e0
Create Date: 2026-07-05

Extends the HR approval engine to support named individual approvers and
"all of N must approve" parallel gates:

- adds hr.workflow_step_instance.required_user_id (a step pinned to a named
  person rather than a role), FK to user.id, indexed;
- makes hr.workflow_step_instance.required_role_id nullable (a named-user step
  has no role).

A step is now gated on EITHER a role OR a named user; multiple required steps
may share a step_order to model parallel co-approval. Schema-only.
"""

import sqlalchemy as sa

from alembic import op

revision = "c3e5a1b7d9f2"
down_revision = "b1d4f7a9c2e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workflow_step_instance",
        sa.Column("required_user_id", sa.Uuid(), nullable=True),
        schema="hr",
    )
    op.create_foreign_key(
        "fk_workflow_step_instance_required_user_id_user",
        "workflow_step_instance",
        "user",
        ["required_user_id"],
        ["id"],
        source_schema="hr",
    )
    op.create_index(
        op.f("ix_hr_workflow_step_instance_required_user_id"),
        "workflow_step_instance",
        ["required_user_id"],
        unique=False,
        schema="hr",
    )
    op.alter_column(
        "workflow_step_instance",
        "required_role_id",
        existing_type=sa.Uuid(),
        nullable=True,
        schema="hr",
    )


def downgrade() -> None:
    op.alter_column(
        "workflow_step_instance",
        "required_role_id",
        existing_type=sa.Uuid(),
        nullable=False,
        schema="hr",
    )
    op.drop_index(
        op.f("ix_hr_workflow_step_instance_required_user_id"),
        table_name="workflow_step_instance",
        schema="hr",
    )
    op.drop_constraint(
        "fk_workflow_step_instance_required_user_id_user",
        "workflow_step_instance",
        schema="hr",
        type_="foreignkey",
    )
    op.drop_column(
        "workflow_step_instance",
        "required_user_id",
        schema="hr",
    )
