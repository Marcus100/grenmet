"""Audit entries record how the actor signed in (account or app session, and which app).

Additive: two nullable columns on ``audit_entry`` in the application database, no
backfill and no index. Existing rows stay NULL, which reads as "not recorded". New
rows written by an organisation request say ``account`` or ``app`` (ADR-0016), and
``app`` rows also name the app. The downgrade drops the two columns and their data.

Revision ID: auditactorsession20261030
Revises: employmentend20261030
"""

import sqlalchemy as sa

from alembic import op

revision = "auditactorsession20261030"
down_revision = "employmentend20261030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "audit_entry",
        sa.Column("actor_session", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "audit_entry",
        sa.Column("actor_app", sa.String(length=40), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("audit_entry", "actor_app")
    op.drop_column("audit_entry", "actor_session")
