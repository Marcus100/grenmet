"""NHC text provenance and import events, independent of image collector leases."""

from alembic import op

revision = "wxwatch_0005"
down_revision = "wxwatch_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE archive_nhc_text (
        edition_id uuid PRIMARY KEY REFERENCES archive_editions(id),
        storm_id text, bulletin_code text, bulletin_text text NOT NULL,
        decoded_sha256 text NOT NULL, decoded_metadata jsonb NOT NULL)""")
    op.execute("""CREATE TABLE archive_nhc_events (
        id uuid PRIMARY KEY, run_key text NOT NULL, product_key text NOT NULL,
        edition_id uuid REFERENCES archive_editions(id),
        outcome text NOT NULL CHECK(outcome IN ('downloaded','checked_unchanged','failed')),
        attempted_at timestamptz NOT NULL, retrieved_at timestamptz, checked_at timestamptz,
        imported_at timestamptz NOT NULL DEFAULT now(), manifest_sha256 text NOT NULL,
        source_metadata jsonb NOT NULL)""")
    op.execute(
        "CREATE INDEX archive_nhc_events_edition ON archive_nhc_events(edition_id,attempted_at)"
    )


def downgrade() -> None:
    raise RuntimeError("NHC archive history must not be dropped automatically")
