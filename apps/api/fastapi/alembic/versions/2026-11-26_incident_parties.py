"""Incidents: persons involved and witnesses, damage, resources used (#1876).

Additive: three new tables in the ``incidents`` schema.

Revision ID: incidentparties20261126
Revises: bookingdeposithold20261126
"""

import sqlalchemy as sa

from alembic import op

revision = "incidentparties20261126"
down_revision = "bookingdeposithold20261126"
branch_labels = None
depends_on = None

SCHEMA = "incidents"
_ORG = "org.organisation.id"
_INCIDENT = "incidents.incident.id"


def upgrade() -> None:
    op.create_table(
        "party",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("incident_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("affiliation", sa.String(12), nullable=False),
        sa.Column("company", sa.String(120), nullable=True),
        sa.Column("contact_phone", sa.String(40), nullable=True),
        sa.Column("contact_email", sa.String(320), nullable=True),
        sa.Column("injured", sa.Boolean(), nullable=False),
        sa.Column("injury_notes", sa.String(1000), nullable=True),
        sa.Column("statement", sa.Text(), nullable=True),
        sa.Column("added_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["incident_id"],
            [_INCIDENT],
            name=op.f("party_incident_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("party_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "kind IN ('involved', 'witness')", name=op.f("party_kind_check")
        ),
        sa.CheckConstraint(
            "affiliation IN ('staff', 'passenger', 'crew', 'tenant', 'contractor', "
            "'public', 'other')",
            name=op.f("party_affiliation_check"),
        ),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 120", name=op.f("party_name_check")
        ),
        schema=SCHEMA,
    )
    op.create_index(
        op.f("incidents_party_incident_id_idx"), "party", ["incident_id"], schema=SCHEMA
    )
    op.create_index(
        op.f("incidents_party_organisation_id_idx"),
        "party",
        ["organisation_id"],
        schema=SCHEMA,
    )
    op.create_table(
        "damage",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("incident_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("item", sa.String(200), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("estimated_cost_minor", sa.BigInteger(), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("added_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["incident_id"],
            [_INCIDENT],
            name=op.f("damage_incident_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("damage_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "char_length(description) BETWEEN 1 AND 2000",
            name=op.f("damage_description_check"),
        ),
        sa.CheckConstraint(
            "estimated_cost_minor IS NULL OR estimated_cost_minor >= 0",
            name=op.f("damage_cost_check"),
        ),
        sa.CheckConstraint(
            "char_length(currency) = 3", name=op.f("damage_currency_check")
        ),
        schema=SCHEMA,
    )
    op.create_index(
        op.f("incidents_damage_incident_id_idx"),
        "damage",
        ["incident_id"],
        schema=SCHEMA,
    )
    op.create_index(
        op.f("incidents_damage_organisation_id_idx"),
        "damage",
        ["organisation_id"],
        schema=SCHEMA,
    )
    op.create_table(
        "resource",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("incident_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.String(1000), nullable=True),
        sa.Column("added_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["incident_id"],
            [_INCIDENT],
            name=op.f("resource_incident_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("resource_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 200", name=op.f("resource_name_check")
        ),
        sa.CheckConstraint(
            "quantity BETWEEN 1 AND 10000", name=op.f("resource_quantity_check")
        ),
        sa.CheckConstraint(
            "ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at",
            name=op.f("resource_times_check"),
        ),
        schema=SCHEMA,
    )
    op.create_index(
        op.f("incidents_resource_incident_id_idx"),
        "resource",
        ["incident_id"],
        schema=SCHEMA,
    )
    op.create_index(
        op.f("incidents_resource_organisation_id_idx"),
        "resource",
        ["organisation_id"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("resource", schema=SCHEMA)
    op.drop_table("damage", schema=SCHEMA)
    op.drop_table("party", schema=SCHEMA)
