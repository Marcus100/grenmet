"""Stored images (F8): organiser logo and listing cover image.

Both columns hold the id of a completed organisation upload in the main
database (``org.upload``). No cross-database foreign key; the service checks the
upload belongs to the organiser's organisation before storing the id.

Additive and nullable, so existing rows and clients are unaffected.
"""

from alembic import op

revision = "events_0007"
# Written on events_0004 (the latest on dev when this was built); re-chain onto
# the newest revision when merging after events_0005 and events_0006.
down_revision = "events_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE organisers ADD COLUMN logo_file_id UUID;
        ALTER TABLE listings ADD COLUMN image_file_id UUID;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE listings DROP COLUMN image_file_id;
        ALTER TABLE organisers DROP COLUMN logo_file_id;
    """)
