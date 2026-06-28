"""cap alert identifier: consolidate unique constraint + index into a unique index

Revision ID: a1c2e3f4d5b6
Revises: f8d6f0932ffe
Create Date: 2026-06-28 00:45:00.000000

The CAP models declare ``identifier = Field(unique=True, index=True)`` which maps to a
single unique index. The DB had a separate unique CONSTRAINT plus a non-unique index
(redundant). This consolidates to match the model. The FK ``ondelete=CASCADE`` and
TEXT-type drift were resolved on the model side (the DB already had them), so they
need no migration.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "a1c2e3f4d5b6"
down_revision = "f8d6f0932ffe"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        op.f("alert_identifier_key"), "alert", schema="cap", type_="unique"
    )
    op.drop_index(op.f("ix_cap_alert_identifier"), table_name="alert", schema="cap")
    op.create_index(
        op.f("ix_cap_alert_identifier"),
        "alert",
        ["identifier"],
        unique=True,
        schema="cap",
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_cap_alert_identifier"), table_name="alert", schema="cap")
    op.create_index(
        op.f("ix_cap_alert_identifier"),
        "alert",
        ["identifier"],
        unique=False,
        schema="cap",
    )
    op.create_unique_constraint(
        op.f("alert_identifier_key"), "alert", ["identifier"], schema="cap"
    )
