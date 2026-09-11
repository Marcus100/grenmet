"""Private saved signatures and immutable signed submission PDFs."""

import sqlalchemy as sa

from alembic import op

revision = "d2e3f4a5b6c7"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "saved_signature",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id"), primary_key=True),
        sa.Column("version", sa.Uuid(), nullable=False),
        sa.Column("image", sa.LargeBinary(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        schema="hr",
    )
    op.create_table(
        "signed_document",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("entity_type", sa.String(60), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("signer_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("subject_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column(
            "department_id",
            sa.String(),
            sa.ForeignKey("hr.department.id"),
            nullable=False,
        ),
        sa.Column("signer_name", sa.String(255), nullable=False),
        sa.Column("signature_version", sa.Uuid(), nullable=False),
        sa.Column("signed_at", sa.DateTime(), nullable=False),
        sa.Column("snapshot", sa.String(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("pdf", sa.LargeBinary(), nullable=False),
        sa.UniqueConstraint(
            "entity_type", "entity_id", name="uq_signed_document_entity"
        ),
        schema="hr",
    )
    for column in ("entity_id", "signer_id"):
        op.create_index(
            f"ix_hr_signed_document_{column}", "signed_document", [column], schema="hr"
        )


def downgrade() -> None:
    op.drop_table("signed_document", schema="hr")
    op.drop_table("saved_signature", schema="hr")
