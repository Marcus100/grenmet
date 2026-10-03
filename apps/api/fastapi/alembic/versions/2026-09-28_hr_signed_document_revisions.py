"""Retain immutable signed revisions and their original document links.

Revision ID: signed20260928
Revises: reversal20260928
"""

import sqlalchemy as sa

from alembic import op

revision = "signed20260928"
down_revision = "reversal20260928"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "signed_document",
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        schema="hr",
    )
    op.add_column(
        "signed_document",
        sa.Column("supersedes_document_id", sa.Uuid(), nullable=True),
        schema="hr",
    )
    op.create_foreign_key(
        "fk_hr_signed_document_supersedes",
        "signed_document",
        "signed_document",
        ["supersedes_document_id"],
        ["id"],
        source_schema="hr",
        referent_schema="hr",
    )
    op.create_unique_constraint(
        "uq_signed_document_entity_revision",
        "signed_document",
        ["entity_type", "entity_id", "revision"],
        schema="hr",
    )
    op.drop_constraint(
        "uq_signed_document_entity", "signed_document", schema="hr", type_="unique"
    )


def downgrade() -> None:
    connection = op.get_bind()
    if connection.scalar(
        sa.text("SELECT EXISTS(SELECT 1 FROM hr.signed_document WHERE revision > 1)")
    ):
        raise RuntimeError(
            "Cannot downgrade while signed revision evidence exists; retain immutable HR history"
        )
    op.create_unique_constraint(
        "uq_signed_document_entity",
        "signed_document",
        ["entity_type", "entity_id"],
        schema="hr",
    )
    op.drop_constraint(
        "uq_signed_document_entity_revision",
        "signed_document",
        schema="hr",
        type_="unique",
    )
    op.drop_constraint(
        "fk_hr_signed_document_supersedes",
        "signed_document",
        schema="hr",
        type_="foreignkey",
    )
    op.drop_column("signed_document", "supersedes_document_id", schema="hr")
    op.drop_column("signed_document", "revision", schema="hr")
