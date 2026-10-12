"""NHC decoded editions and durable on-demand jobs."""

from alembic import op

revision = "wxwatch_0007"
down_revision = "wxwatch_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE TABLE archive_nhc_product_state (product_key text PRIMARY KEY, metadata jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())"
    )
    op.execute("""CREATE TABLE archive_nhc_decoded (
        edition_id uuid PRIMARY KEY REFERENCES archive_editions(id),
        family text NOT NULL, kind text NOT NULL, storm_id text,
        decoded_metadata jsonb NOT NULL, decoded_asset_id uuid REFERENCES archive_assets(id),
        header_issued_at timestamptz)""")
    op.execute(
        "CREATE INDEX archive_nhc_decoded_family ON archive_nhc_decoded(family,storm_id)"
    )
    op.execute("""CREATE TABLE archive_nhc_jobs (
        id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('pull','point')),
        status text NOT NULL CHECK(status IN ('queued','running','success','partial','failed')),
        requested_by uuid NOT NULL, payload jsonb NOT NULL, result jsonb,
        created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz,
        finished_at timestamptz, lease_until timestamptz, lease_token uuid, attempts integer NOT NULL DEFAULT 0,
        error text)""")
    op.execute(
        "CREATE INDEX archive_nhc_jobs_pending ON archive_nhc_jobs(status,created_at)"
    )
    op.execute(
        "CREATE UNIQUE INDEX archive_nhc_one_pull ON archive_nhc_jobs(kind) WHERE kind='pull' AND status IN ('queued','running')"
    )


def downgrade() -> None:
    raise RuntimeError("NHC operational history must not be dropped automatically")
