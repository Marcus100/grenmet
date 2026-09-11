"""Employee training history; no course/competency catalogue or reminders."""

import sqlalchemy as sa

from alembic import op

revision = "c1d2e3f4a5b6"
down_revision = "b9c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "training_record",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("hr.organisation.id"),
            nullable=False,
        ),
        sa.Column("department_id", sa.String(100), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("course_name", sa.String(200), nullable=False),
        sa.Column("provider", sa.String(200), nullable=False),
        sa.Column("completed_on", sa.Date(), nullable=False),
        sa.Column("result", sa.String(20), nullable=False),
        sa.Column("expires_on", sa.Date()),
        sa.Column("notes", sa.String(2000)),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("archived_at", sa.DateTime()),
        sa.Column("archived_by", sa.Uuid(), sa.ForeignKey("user.id")),
        sa.Column("archive_reason", sa.String(500)),
        sa.ForeignKeyConstraint(
            ["department_id", "organisation_id"],
            ["hr.department.id", "hr.department.organisation_id"],
            name="fk_training_department_org",
        ),
        sa.CheckConstraint(
            "result IN ('completed', 'attended', 'failed')", name="ck_training_result"
        ),
        sa.CheckConstraint(
            "expires_on IS NULL OR (result = 'completed' AND expires_on >= completed_on)",
            name="ck_training_expiry",
        ),
        schema="hr",
    )
    for column in ("organisation_id", "user_id"):
        op.create_index(
            f"ix_hr_training_record_{column}", "training_record", [column], schema="hr"
        )


def downgrade() -> None:
    op.drop_table("training_record", schema="hr")
