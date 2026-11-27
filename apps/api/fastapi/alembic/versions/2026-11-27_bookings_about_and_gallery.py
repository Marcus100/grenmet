"""Business "about" text and a gallery of its work (richer business page, slice 1).

Additive, nothing backfilled:

- ``bookings.profile.about``: plain text up to 1000 characters, nullable, with the
  same kind of length CHECK as ``booking_policy``.
- ``bookings.gallery_photo``: one row per photograph, scoped by ``organisation_id``,
  naming a completed ``booking-gallery`` upload (no FK to the upload, the same as
  ``logo_file_id`` and ``cover_file_id``). One file may appear once per business;
  ``sort_order`` is the arranged position.

The downgrade drops the table, the column and the check only.

Revision ID: bookingabout20261127
Revises: bookingbookedname20261126
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingabout20261127"
down_revision = "bookingbookedname20261126"
branch_labels = None
depends_on = None

#: Final names (``op.f``): the metadata convention would add the table prefix again.
ABOUT_CHECK = "profile_about_check"
FILE_UNIQUE = "gallery_photo_file"
ORG_INDEX = "bookings_gallery_photo_organisation_id_idx"


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "profile",
        sa.Column("about", sa.String(length=1000), nullable=True),
        schema="bookings",
    )
    op.create_check_constraint(
        op.f(ABOUT_CHECK),
        "profile",
        "about IS NULL OR char_length(about) BETWEEN 1 AND 1000",
        schema="bookings",
    )
    op.create_table(
        "gallery_photo",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("file_id", sa.Uuid(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("gallery_photo_pkey")),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name=op.f("gallery_photo_organisation_id_fkey"),
        ),
        sa.UniqueConstraint("organisation_id", "file_id", name=op.f(FILE_UNIQUE)),
        schema="bookings",
    )
    op.create_index(
        op.f(ORG_INDEX),
        "gallery_photo",
        ["organisation_id"],
        schema="bookings",
    )


def downgrade() -> None:
    op.drop_index(op.f(ORG_INDEX), table_name="gallery_photo", schema="bookings")
    op.drop_table("gallery_photo", schema="bookings")
    op.drop_constraint(op.f(ABOUT_CHECK), "profile", schema="bookings", type_="check")
    op.drop_column("profile", "about", schema="bookings")
