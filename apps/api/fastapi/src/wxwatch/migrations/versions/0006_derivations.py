"""Processing lineage, independent of meteorological editions."""

from alembic import op

revision = "wxwatch_0006"
down_revision = "wxwatch_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE archive_derivations (
        id uuid PRIMARY KEY, output_asset_id uuid NOT NULL REFERENCES archive_assets(id),
        processor text NOT NULL, processor_version text NOT NULL,
        options jsonb NOT NULL, generated_at timestamptz,
        recorded_at timestamptz NOT NULL DEFAULT now())""")
    op.execute("""CREATE TABLE archive_derivation_inputs (
        derivation_id uuid NOT NULL REFERENCES archive_derivations(id),
        asset_id uuid NOT NULL REFERENCES archive_assets(id),
        PRIMARY KEY(derivation_id,asset_id))""")
    op.execute(
        "CREATE INDEX archive_derivations_output ON archive_derivations(output_asset_id)"
    )
    op.execute(
        "CREATE INDEX archive_derivation_inputs_asset ON archive_derivation_inputs(asset_id)"
    )


def downgrade() -> None:
    raise RuntimeError("Processing lineage must not be dropped automatically")
