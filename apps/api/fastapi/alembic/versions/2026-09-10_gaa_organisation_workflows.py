"""GAA structure, access review and configurable workflow stages; no live grant changes."""

import sqlalchemy as sa

from alembic import op

revision = "e5f7a9b1c3d4"
down_revision = "d4e6f8a0b2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organisation_unit",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column(
            "department_id",
            sa.String(100),
            sa.ForeignKey("hr.department.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column("parent_id", sa.String(100), sa.ForeignKey("organisation_unit.id")),
        sa.Column("source_slide", sa.Integer(), nullable=False),
    )
    op.create_table(
        "organisation_position",
        sa.Column("id", sa.String(120), primary_key=True),
        sa.Column(
            "unit_id",
            sa.String(100),
            sa.ForeignKey("organisation_unit.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "reports_to_position_id",
            sa.String(120),
            sa.ForeignKey("organisation_position.id"),
        ),
        sa.Column(
            "additional_connection_id",
            sa.String(120),
            sa.ForeignKey("organisation_position.id"),
        ),
        sa.Column("grade_code", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("authorised_posts", sa.Integer()),
        sa.Column("reported_vacancies", sa.Integer()),
        sa.Column("source_slide", sa.Integer(), nullable=False),
        sa.Column("notes", sa.String(2000), nullable=False),
    )
    op.create_table(
        "access_review",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("assignment_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("subject_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("reviewer_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("decision", sa.String(20), nullable=False),
        sa.Column("reason", sa.String(1000), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    for table in ("workflow_step_template", "workflow_step_instance"):
        op.add_column(
            table,
            sa.Column(
                "scope_enforced",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
            schema="hr",
        )
        op.add_column(
            table,
            sa.Column(
                "purpose", sa.String(20), nullable=False, server_default="APPROVAL"
            ),
            schema="hr",
        )
        op.add_column(
            table,
            sa.Column(
                "label", sa.String(150), nullable=False, server_default="Approval"
            ),
            schema="hr",
        )
    op.alter_column(
        "workflow_step_template", "required_role_id", nullable=True, schema="hr"
    )
    op.add_column(
        "workflow_step_template",
        sa.Column("required_user_id", sa.Uuid(), sa.ForeignKey("user.id")),
        schema="hr",
    )
    # Record is stored as an APPROVE action with a RECORDING purpose on the
    # immutable step snapshot. It never changes the entity decision.


def downgrade() -> None:
    op.drop_column("workflow_step_template", "required_user_id", schema="hr")
    # Nullable role retained on downgrade: named-user templates cannot safely be
    # converted into arbitrary role grants.
    for table in ("workflow_step_template", "workflow_step_instance"):
        op.execute(f"ALTER TABLE hr.{table} DROP COLUMN IF EXISTS scope_enforced")
        op.drop_column(table, "label", schema="hr")
        op.drop_column(table, "purpose", schema="hr")
    op.drop_table("access_review")
    op.drop_table("organisation_position")
    op.drop_table("organisation_unit")
