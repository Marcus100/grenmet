"""Organisation-owned public sites and product entitlements (ADR-0025 N1/N2, PF1).

Additive. Creates ``org.public_site``; seeds the ``barrels`` organisation and the
sites that were environment settings before (values stay null, so the
environment fallback keeps applying); grants the ``rewards`` and ``bookings``
entitlements to every organisation already using them, because their
organisation routes now require the entitlement.

Revision ID: orgsites20261020
Revises: bookings20261019
"""

import sqlalchemy as sa

from alembic import op

revision = "orgsites20261020"
down_revision = "bookings20261019"
branch_labels = None
depends_on = None

#: (key, organisation id, name, accepts contact, accepts subscriptions)
DEFAULT_SITES = (
    ("barrels", "barrels", "Barrels Grenada", True, True),
    ("signal", "barrels", "Grenada Signal", False, True),
    ("mbia", "gaa", "MBIA website", True, False),
    ("gms-alerts", "gaa", "GMS weather alerts", False, True),
)
SITE_IDS = {
    "barrels": "site_seed_barrels",
    "signal": "site_seed_signal",
    "mbia": "site_seed_mbia",
    "gms-alerts": "site_seed_gms_alerts",
}


def upgrade() -> None:
    op.create_table(
        "public_site",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("org.organisation.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("key", sa.String(40), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("site_url", sa.String(255)),
        sa.Column("contact_recipient", sa.String(254)),
        sa.Column("accepts_contact", sa.Boolean(), nullable=False),
        sa.Column("accepts_subscriptions", sa.Boolean(), nullable=False),
        sa.Column("turnstile_mode", sa.String(20), nullable=False),
        sa.Column("turnstile_site_key", sa.String(255)),
        sa.Column("turnstile_secret_encrypted", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("key", name=op.f("public_site_key_key")),
        sa.CheckConstraint(
            "key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'",
            name=op.f("public_site_key_format_check"),
        ),
        sa.CheckConstraint(
            "turnstile_mode IN ('inherit', 'off', 'enforce')",
            name=op.f("public_site_turnstile_mode_check"),
        ),
        schema="org",
    )
    op.create_index(
        "public_site_organisation_id_idx",
        "public_site",
        ["organisation_id"],
        schema="org",
    )
    op.execute(
        """
        INSERT INTO org.organisation (id, slug, name, kind, status, created_at, updated_at)
        SELECT 'barrels',
               CASE WHEN EXISTS (SELECT 1 FROM org.organisation WHERE slug = 'barrels')
                    THEN 'barrels-grenada' ELSE 'barrels' END,
               'Barrels Grenada', 'barrels', 'active',
               (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc')
        ON CONFLICT (id) DO NOTHING
        """
    )
    bind = op.get_bind()
    for key, organisation_id, name, contact, subscriptions in DEFAULT_SITES:
        bind.execute(
            sa.text(
                """
                INSERT INTO org.public_site (
                    id, organisation_id, key, name, accepts_contact,
                    accepts_subscriptions, turnstile_mode, created_at, updated_at
                )
                SELECT :id, :organisation_id, :key, :name, :contact, :subscriptions,
                       'inherit', (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc')
                WHERE EXISTS (
                    SELECT 1 FROM org.organisation
                    WHERE id = CAST(:organisation_id AS varchar)
                )
                ON CONFLICT (key) DO NOTHING
                """
            ),
            {
                "id": SITE_IDS[key],
                "organisation_id": organisation_id,
                "key": key,
                "name": name,
                "contact": contact,
                "subscriptions": subscriptions,
            },
        )
    op.execute(
        """
        INSERT INTO org.organisation_app (
            organisation_id, app_key, enabled, created_at, updated_at
        )
        SELECT DISTINCT organisation_id, 'rewards', true,
               (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc')
        FROM rewards.program
        ON CONFLICT (organisation_id, app_key) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO org.organisation_app (
            organisation_id, app_key, enabled, created_at, updated_at
        )
        SELECT DISTINCT organisation_id, 'bookings', true,
               (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc')
        FROM bookings.profile
        ON CONFLICT (organisation_id, app_key) DO NOTHING
        """
    )


def downgrade() -> None:
    # Entitlement rows and the barrels organisation are kept: they are valid
    # data without this table, and removing them could revoke real access.
    op.drop_index(
        "public_site_organisation_id_idx", table_name="public_site", schema="org"
    )
    op.drop_table("public_site", schema="org")
