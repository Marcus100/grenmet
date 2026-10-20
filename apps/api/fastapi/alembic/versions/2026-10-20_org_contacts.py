"""Organisation contacts and per-purpose consent history (ADR-0028, PF3).

Additive. Creates ``org.contact`` and ``org.contact_consent``. Nothing is
backfilled and no entitlement is granted: the ``contacts`` product is switched
on per organisation by an administrator.

Revision ID: orgcontacts20261020
Revises: orgsites20261020
"""

import sqlalchemy as sa

from alembic import op

revision = "orgcontacts20261020"
down_revision = "featureflags20261020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contact",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("org.organisation.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email_hash", sa.String(64), nullable=False),
        sa.Column("email", sa.String(320)),
        sa.Column("name", sa.String(255)),
        sa.Column("phone", sa.String(40)),
        sa.Column("user_id", sa.Uuid()),
        sa.Column("source", sa.String(40), nullable=False),
        sa.Column("erased_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "organisation_id", "email_hash", name="contact_organisation_email_hash"
        ),
        schema="org",
    )
    op.create_index(
        "contact_organisation_id_idx", "contact", ["organisation_id"], schema="org"
    )
    op.create_index("contact_user_id_idx", "contact", ["user_id"], schema="org")
    op.create_table(
        "contact_consent",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column(
            "contact_id",
            sa.String(100),
            sa.ForeignKey("org.contact.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("org.organisation.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("granted", sa.Boolean(), nullable=False),
        sa.Column("source", sa.String(40), nullable=False),
        sa.Column("granted_at", sa.DateTime()),
        sa.Column("revoked_at", sa.DateTime()),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "purpose IN ('marketing', 'service', 'analytics')",
            name=op.f("contact_consent_purpose_check"),
        ),
        schema="org",
    )
    op.create_index(
        "contact_consent_contact_id_idx",
        "contact_consent",
        ["contact_id"],
        schema="org",
    )
    op.create_index(
        "contact_consent_organisation_id_idx",
        "contact_consent",
        ["organisation_id"],
        schema="org",
    )
    op.create_index(
        "contact_consent_contact_purpose_idx",
        "contact_consent",
        ["contact_id", "purpose", "recorded_at"],
        schema="org",
    )


def downgrade() -> None:
    op.drop_table("contact_consent", schema="org")
    op.drop_table("contact", schema="org")
