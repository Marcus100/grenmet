"""Add the catalogue alongside unchanged legacy gallery tables."""

from alembic import op

revision = "wxwatch_0003"
down_revision = "wxwatch_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    statements = [
        """CREATE TABLE archive_sources (id uuid PRIMARY KEY, key text NOT NULL UNIQUE, name text NOT NULL, role text NOT NULL CHECK (role IN ('collector','issuer','distributor')))""",
        """CREATE TABLE archive_products (
            id uuid PRIMARY KEY, source_id uuid NOT NULL REFERENCES archive_sources(id),
            key text NOT NULL UNIQUE, title text NOT NULL, product_type text NOT NULL,
            identity_basis text NOT NULL, station_ref text, coverage jsonb,
            created_at timestamptz NOT NULL DEFAULT now())""",
        """CREATE TABLE archive_product_aliases (
            product_id uuid NOT NULL REFERENCES archive_products(id), namespace text NOT NULL,
            value text NOT NULL, PRIMARY KEY (namespace,value))""",
        """CREATE TABLE archive_editions (
            id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES archive_products(id),
            observed_at timestamptz, issued_at timestamptz, reference_time timestamptz,
            valid_start timestamptz, valid_end timestamptz, nominal_time timestamptz,
            time_basis text NOT NULL, first_received_at timestamptz NOT NULL,
            source_modified_at timestamptz, coverage jsonb, source_metadata jsonb NOT NULL,
            CHECK (valid_end IS NULL OR valid_start IS NULL OR valid_end >= valid_start))""",
        "CREATE INDEX archive_editions_product_time ON archive_editions(product_id,nominal_time)",
        """CREATE TABLE archive_assets (
            id uuid PRIMARY KEY, sha256 text NOT NULL UNIQUE CHECK (sha256 ~ '^[0-9a-f]{64}$'),
            byte_size bigint NOT NULL CHECK (byte_size > 0), media_type text NOT NULL,
            width integer CHECK (width > 0), height integer CHECK (height > 0),
            frame_count integer CHECK (frame_count > 0), created_at timestamptz NOT NULL DEFAULT now())""",
        """CREATE TABLE archive_edition_assets (
            edition_id uuid NOT NULL REFERENCES archive_editions(id), asset_id uuid NOT NULL REFERENCES archive_assets(id),
            role text NOT NULL, original_name text, PRIMARY KEY (edition_id,asset_id,role))""",
        """CREATE TABLE archive_replicas (
            id uuid PRIMARY KEY, asset_id uuid NOT NULL REFERENCES archive_assets(id), backend_key text NOT NULL,
            object_key text NOT NULL, state text NOT NULL CHECK (state IN ('verified','missing','failed')),
            verified_at timestamptz, verified_sha256 text, UNIQUE (backend_key,object_key),
            CHECK (state != 'verified' OR (verified_at IS NOT NULL AND verified_sha256 IS NOT NULL)))""",
        """CREATE TABLE archive_legacy_images (
            legacy_id integer PRIMARY KEY REFERENCES weather_images(id),
            edition_id uuid NOT NULL UNIQUE REFERENCES archive_editions(id), asset_id uuid REFERENCES archive_assets(id),
            storage_path text NOT NULL, status text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','verified','unverified','missing','mismatch','unsafe','unstable','unsupported')),
            integrity_basis text, last_attempt_at timestamptz, error_code text)""",
        "CREATE INDEX archive_legacy_pending ON archive_legacy_images(status,last_attempt_at)",
    ]
    for statement in statements:
        op.execute(statement)


def downgrade() -> None:
    raise RuntimeError("Catalogue records must not be dropped automatically")
