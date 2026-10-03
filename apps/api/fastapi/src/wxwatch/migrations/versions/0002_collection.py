"""Track collection runs and archive provenance without rewriting legacy records."""

from alembic import op

revision = "wxwatch_0002"
down_revision = "wxwatch_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE collection_runs (
        id uuid PRIMARY KEY, source text NOT NULL,
        started_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL DEFAULT (now() + interval '45 minutes'),
        finished_at timestamptz, status text NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'finished', 'failed', 'expired'))
    )""")
    op.execute(
        "CREATE UNIQUE INDEX collection_active_source ON collection_runs(source) WHERE status = 'running'"
    )
    op.execute(
        "ALTER TABLE weather_images ADD COLUMN run_id uuid REFERENCES collection_runs(id), ADD COLUMN product_key text, ADD COLUMN time_basis text NOT NULL DEFAULT 'legacy_unknown'"
    )
    op.execute(
        """UPDATE weather_images SET product_key = coalesce(spider_name, 'unknown') || ':' || CASE WHEN spider_name = 'goes19' THEN regexp_replace(coalesce(name, image_url, id::text), '^\\d+_', '') ELSE md5(split_part(split_part(coalesce(image_url, name, id::text), '?', 1), '#', 1)) END"""
    )
    op.execute("ALTER TABLE weather_images ALTER COLUMN product_key SET NOT NULL")
    op.execute(
        "CREATE INDEX images_product_time ON weather_images(product_key, observation_time)"
    )


def downgrade() -> None:
    raise RuntimeError("Archive provenance cannot be dropped automatically")
