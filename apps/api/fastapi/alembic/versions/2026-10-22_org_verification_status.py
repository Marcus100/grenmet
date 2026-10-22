"""Organisation verification status (moderation).

Additive. ``org.organisation`` gains ``verification_status``
(pending/approved/rejected), ``verification_reason`` and
``verification_decided_at``. Existing verified organisations backfill to
``approved``, every other row to ``pending``. ``verified_at`` is unchanged and
remains the single "is verified" signal.

Revision ID: orgverifystatus20261022
Revises: membershipgrant20261022
"""

import sqlalchemy as sa

from alembic import op

revision = "orgverifystatus20261022"
down_revision = "membershipgrant20261022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organisation",
        sa.Column(
            "verification_status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        schema="org",
    )
    op.add_column(
        "organisation",
        sa.Column("verification_reason", sa.Text()),
        schema="org",
    )
    op.add_column(
        "organisation",
        sa.Column("verification_decided_at", sa.DateTime()),
        schema="org",
    )
    op.execute(
        "UPDATE org.organisation SET verification_status = 'approved' "
        "WHERE verified_at IS NOT NULL"
    )
    op.create_check_constraint(
        op.f("organisation_verification_status_check"),
        "organisation",
        "verification_status IN ('pending', 'approved', 'rejected')",
        schema="org",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("organisation_verification_status_check"),
        "organisation",
        schema="org",
        type_="check",
    )
    op.drop_column("organisation", "verification_decided_at", schema="org")
    op.drop_column("organisation", "verification_reason", schema="org")
    op.drop_column("organisation", "verification_status", schema="org")
