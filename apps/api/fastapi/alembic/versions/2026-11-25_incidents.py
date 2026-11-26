"""Incidents: categories, checklists, incidents, timeline and notes (ADR-0067, #1876).

Additive: a new ``incidents`` schema with seven tables. Nothing existing changes.
Hand-written so every constraint and index name is explicit.

Revision ID: incidents20261125
Revises: opslog20261125
"""

import sqlalchemy as sa

from alembic import op

revision = "incidents20261125"
down_revision = "opslog20261125"
branch_labels = None
depends_on = None

SCHEMA = "incidents"
_ORG = "org.organisation.id"


def _org_fk(table: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        ["organisation_id"],
        [_ORG],
        name=op.f(f"{table}_organisation_id_fkey"),
        ondelete="CASCADE",
    )


def _index(table: str, column: str) -> None:
    op.create_index(
        op.f(f"{SCHEMA}_{table}_{column}_idx"), table, [column], schema=SCHEMA
    )


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    op.create_table(
        "category",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("manager_user_id", sa.Uuid(), nullable=True),
        sa.Column("archived_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        _org_fk("category"),
        sa.UniqueConstraint(
            "organisation_id", "name", name="category_organisation_name"
        ),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 80", name=op.f("category_name_check")
        ),
        schema=SCHEMA,
    )
    _index("category", "organisation_id")

    op.create_table(
        "checklist_item",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("category_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("archived_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["category_id"],
            [f"{SCHEMA}.category.id"],
            name=op.f("checklist_item_category_id_fkey"),
            ondelete="CASCADE",
        ),
        _org_fk("checklist_item"),
        sa.CheckConstraint(
            "char_length(label) BETWEEN 1 AND 200",
            name=op.f("checklist_item_label_check"),
        ),
        schema=SCHEMA,
    )
    _index("checklist_item", "category_id")
    _index("checklist_item", "organisation_id")

    op.create_table(
        "counter",
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False, autoincrement=False),
        sa.Column("last_number", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("organisation_id", "year", name=op.f("counter_pkey")),
        _org_fk("counter"),
        schema=SCHEMA,
    )

    op.create_table(
        "incident",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("reference", sa.String(20), nullable=False),
        sa.Column("category_id", sa.String(100), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("location", sa.String(200), nullable=True),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.Column("exercise", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("reported_by", sa.Uuid(), nullable=False),
        sa.Column("opened_at", sa.DateTime(), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("closed_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        _org_fk("incident"),
        sa.ForeignKeyConstraint(
            ["category_id"],
            [f"{SCHEMA}.category.id"],
            name=op.f("incident_category_id_fkey"),
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint(
            "organisation_id", "reference", name="incident_organisation_reference"
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'open', 'closed')", name=op.f("incident_status_check")
        ),
        sa.CheckConstraint(
            "char_length(title) BETWEEN 1 AND 200", name=op.f("incident_title_check")
        ),
        sa.CheckConstraint(
            "(status = 'closed') = (closed_at IS NOT NULL)",
            name=op.f("incident_closed_state_check"),
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "incident_organisation_created_idx",
        "incident",
        ["organisation_id", "created_at"],
        schema=SCHEMA,
    )
    _index("incident", "category_id")

    op.create_table(
        "incident_check",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("incident_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("done_at", sa.DateTime(), nullable=True),
        sa.Column("done_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["incident_id"],
            [f"{SCHEMA}.incident.id"],
            name=op.f("incident_check_incident_id_fkey"),
            ondelete="CASCADE",
        ),
        _org_fk("incident_check"),
        sa.CheckConstraint(
            "char_length(label) BETWEEN 1 AND 200",
            name=op.f("incident_check_label_check"),
        ),
        sa.CheckConstraint(
            "(done_at IS NULL) = (done_by IS NULL)",
            name=op.f("incident_check_done_pair_check"),
        ),
        schema=SCHEMA,
    )
    _index("incident_check", "incident_id")
    _index("incident_check", "organisation_id")

    op.create_table(
        "timeline_entry",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("incident_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["incident_id"],
            [f"{SCHEMA}.incident.id"],
            name=op.f("timeline_entry_incident_id_fkey"),
            ondelete="CASCADE",
        ),
        _org_fk("timeline_entry"),
        sa.CheckConstraint(
            "kind IN ('action', 'opened', 'closed', 'reopened')",
            name=op.f("timeline_entry_kind_check"),
        ),
        sa.CheckConstraint(
            "char_length(text) BETWEEN 1 AND 2000",
            name=op.f("timeline_entry_text_check"),
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "timeline_entry_incident_at_idx",
        "timeline_entry",
        ["incident_id", "occurred_at"],
        schema=SCHEMA,
    )
    _index("timeline_entry", "organisation_id")

    op.create_table(
        "note",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("incident_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("private", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["incident_id"],
            [f"{SCHEMA}.incident.id"],
            name=op.f("note_incident_id_fkey"),
            ondelete="CASCADE",
        ),
        _org_fk("note"),
        sa.CheckConstraint(
            "char_length(text) BETWEEN 1 AND 5000", name=op.f("note_text_check")
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "note_incident_created_idx",
        "note",
        ["incident_id", "created_at"],
        schema=SCHEMA,
    )
    _index("note", "organisation_id")


def downgrade() -> None:
    for table in (
        "note",
        "timeline_entry",
        "incident_check",
        "incident",
        "counter",
        "checklist_item",
        "category",
    ):
        op.drop_table(table, schema=SCHEMA)
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
