"""Photo attachments on operations log entries and incidents (ADR-0067).

Additive: ``opslog.entry_attachment`` and ``incidents.attachment``. Each row holds a
storage upload id (``org.upload``, no foreign key: the upload table belongs to the
storage domain), an optional caption and who added it.

Revision ID: opsattach20261125
Revises: bookingdepositreceived20261125
"""

import sqlalchemy as sa

from alembic import op

revision = "opsattach20261125"
down_revision = "bookingdepositreceived20261125"
branch_labels = None
depends_on = None

_ORG = "org.organisation.id"
_CAPTION = "caption IS NULL OR char_length(caption) BETWEEN 1 AND 200"


def upgrade() -> None:
    op.create_table(
        "entry_attachment",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("entry_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("file_id", sa.Uuid(), nullable=False),
        sa.Column("caption", sa.String(200), nullable=True),
        sa.Column("added_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["entry_id"],
            ["opslog.entry.id"],
            name=op.f("entry_attachment_entry_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("entry_attachment_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("entry_id", "file_id", name="entry_attachment_entry_file"),
        sa.CheckConstraint(_CAPTION, name=op.f("entry_attachment_caption_check")),
        schema="opslog",
    )
    op.create_index(
        op.f("opslog_entry_attachment_entry_id_idx"),
        "entry_attachment",
        ["entry_id"],
        schema="opslog",
    )
    op.create_index(
        op.f("opslog_entry_attachment_organisation_id_idx"),
        "entry_attachment",
        ["organisation_id"],
        schema="opslog",
    )
    op.create_table(
        "attachment",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("incident_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("file_id", sa.Uuid(), nullable=False),
        sa.Column("caption", sa.String(200), nullable=True),
        sa.Column("added_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["incident_id"],
            ["incidents.incident.id"],
            name=op.f("attachment_incident_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("attachment_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("incident_id", "file_id", name="attachment_incident_file"),
        sa.CheckConstraint(_CAPTION, name=op.f("attachment_caption_check")),
        schema="incidents",
    )
    op.create_index(
        op.f("incidents_attachment_incident_id_idx"),
        "attachment",
        ["incident_id"],
        schema="incidents",
    )
    op.create_index(
        op.f("incidents_attachment_organisation_id_idx"),
        "attachment",
        ["organisation_id"],
        schema="incidents",
    )


def downgrade() -> None:
    op.drop_table("attachment", schema="incidents")
    op.drop_table("entry_attachment", schema="opslog")
