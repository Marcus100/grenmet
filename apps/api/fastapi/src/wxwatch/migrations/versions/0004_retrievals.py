"""Record collector sightings separately from editions."""

from alembic import op

revision = "wxwatch_0004"
down_revision = "wxwatch_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE archive_retrievals (
        id uuid PRIMARY KEY,
        edition_id uuid NOT NULL REFERENCES archive_editions(id),
        run_id uuid NOT NULL REFERENCES collection_runs(id),
        retrieved_at timestamptz NOT NULL,
        recorded_at timestamptz NOT NULL DEFAULT now(),
        image_url text NOT NULL, storage_path text NOT NULL,
        checksum text NOT NULL, source_metadata jsonb NOT NULL)
    """)
    op.execute(
        "CREATE INDEX archive_retrievals_edition_time ON archive_retrievals(edition_id,retrieved_at)"
    )


def downgrade() -> None:
    raise RuntimeError("Retrieval history must not be dropped automatically")
