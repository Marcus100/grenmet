"""Operations log: logs, categories, entries and comments (ADR-0067, issue #1874).

Additive: a new ``opslog`` schema with four tables. Nothing existing changes.
Hand-written so every constraint and index name is explicit.

Revision ID: opslog20261125
Revises: bookingpaused20261125
"""

import sqlalchemy as sa

from alembic import op

revision = "opslog20261125"
down_revision = "bookingpaused20261125"
branch_labels = None
depends_on = None

SCHEMA = "opslog"
_ORG = "org.organisation.id"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    op.create_table(
        "log",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("edit_rule", sa.String(20), nullable=False),
        sa.Column("edit_window_minutes", sa.Integer(), nullable=True),
        sa.Column("automatic_entries", sa.Boolean(), nullable=False),
        sa.Column("archived_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("log_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("organisation_id", "name", name="log_organisation_name"),
        sa.CheckConstraint(
            "edit_rule IN ('open', 'append_only', 'locked')",
            name=op.f("log_edit_rule_check"),
        ),
        sa.CheckConstraint(
            "edit_window_minutes IS NULL OR edit_window_minutes BETWEEN 1 AND 10080",
            name=op.f("log_edit_window_check"),
        ),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 80", name=op.f("log_name_check")
        ),
        schema=SCHEMA,
    )
    op.create_index(
        op.f("opslog_log_organisation_id_idx"),
        "log",
        ["organisation_id"],
        schema=SCHEMA,
    )
    op.create_table(
        "category",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("log_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("parent_id", sa.String(100), nullable=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("depth", sa.SmallInteger(), nullable=False),
        sa.Column("archived_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["log_id"],
            [f"{SCHEMA}.log.id"],
            name=op.f("category_log_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("category_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            [f"{SCHEMA}.category.id"],
            name=op.f("category_parent_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("depth BETWEEN 1 AND 3", name=op.f("category_depth_check")),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 80", name=op.f("category_name_check")
        ),
        schema=SCHEMA,
    )
    for column in ("log_id", "organisation_id", "parent_id"):
        op.create_index(
            op.f(f"opslog_category_{column}_idx"), "category", [column], schema=SCHEMA
        )
    op.create_table(
        "entry",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("log_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("category_id", sa.String(100), nullable=True),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("location", sa.String(200), nullable=True),
        sa.Column("private", sa.Boolean(), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("source_kind", sa.String(60), nullable=True),
        sa.Column("source_id", sa.String(100), nullable=True),
        sa.Column("outbox_message_id", sa.Uuid(), nullable=True),
        sa.Column("edited_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["log_id"],
            [f"{SCHEMA}.log.id"],
            name=op.f("entry_log_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("entry_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            [f"{SCHEMA}.category.id"],
            name=op.f("entry_category_id_fkey"),
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(
            "source IN ('manual', 'automatic')", name=op.f("entry_source_check")
        ),
        sa.CheckConstraint(
            "char_length(text) BETWEEN 1 AND 5000", name=op.f("entry_text_check")
        ),
        sa.CheckConstraint(
            "(source_kind IS NULL) = (source_id IS NULL)",
            name=op.f("entry_source_ref_check"),
        ),
        sa.UniqueConstraint("outbox_message_id", name="entry_outbox_message_id_key"),
        schema=SCHEMA,
    )
    op.create_index(
        "entry_log_occurred_idx",
        "entry",
        ["log_id", "occurred_at", "id"],
        schema=SCHEMA,
    )
    for column in ("organisation_id", "category_id", "author_id"):
        op.create_index(
            op.f(f"opslog_entry_{column}_idx"), "entry", [column], schema=SCHEMA
        )
    op.create_table(
        "entry_comment",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("entry_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["entry_id"],
            [f"{SCHEMA}.entry.id"],
            name=op.f("entry_comment_entry_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("entry_comment_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "char_length(text) BETWEEN 1 AND 2000",
            name=op.f("entry_comment_text_check"),
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "entry_comment_entry_created_idx",
        "entry_comment",
        ["entry_id", "created_at"],
        schema=SCHEMA,
    )
    op.create_index(
        op.f("opslog_entry_comment_organisation_id_idx"),
        "entry_comment",
        ["organisation_id"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("entry_comment", schema=SCHEMA)
    op.drop_table("entry", schema=SCHEMA)
    op.drop_table("category", schema=SCHEMA)
    op.drop_table("log", schema=SCHEMA)
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
