"""cap alert schema conformance

Revision ID: capalertschema20261030
Revises: sociallive20261030
Create Date: 2026-10-30

Additive: two columns on cap.alert. An imported CAP alert that does not fully
follow the official CAP 1.2 schema is stored with schema_conformant = false and
the first schema error, so forecasters can see it. Existing rows are conformant
by default; they were all authored or imported before the check existed.
"""

import sqlalchemy as sa

from alembic import op

revision = "capalertschema20261030"
down_revision = "sociallive20261030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "alert",
        sa.Column(
            "schema_conformant",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        schema="cap",
    )
    op.add_column(
        "alert",
        sa.Column("schema_error", sa.String(length=1000), nullable=True),
        schema="cap",
    )
    op.add_column(
        "alert",
        sa.Column("import_source", sa.String(length=16), nullable=True),
        schema="cap",
    )


def downgrade() -> None:
    op.drop_column("alert", "import_source", schema="cap")
    op.drop_column("alert", "schema_error", schema="cap")
    op.drop_column("alert", "schema_conformant", schema="cap")
