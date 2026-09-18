from alembic import op

revision = "janitorial_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "DO $$ BEGIN CREATE TYPE period_unit AS ENUM ('minute', 'day'); EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    )
    op.execute("""
        CREATE TABLE IF NOT EXISTS buildings (
          id SERIAL PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS sections (
          id SERIAL PRIMARY KEY, building_id INTEGER NOT NULL REFERENCES buildings(id),
          name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS areas (
          id SERIAL PRIMARY KEY, building_id INTEGER NOT NULL REFERENCES buildings(id),
          section_id INTEGER REFERENCES sections(id), name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS activities (
          id SERIAL PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS task_bundles (
          id SERIAL PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS area_tasks (
          id SERIAL PRIMARY KEY, area_id INTEGER NOT NULL REFERENCES areas(id),
          activity_id INTEGER NOT NULL REFERENCES activities(id), freq_count INTEGER NOT NULL,
          freq_period_value INTEGER NOT NULL, freq_period_unit period_unit NOT NULL,
          mode TEXT, sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS task_bundle_items (
          id SERIAL PRIMARY KEY, bundle_id INTEGER NOT NULL REFERENCES task_bundles(id),
          activity_id INTEGER NOT NULL REFERENCES activities(id), freq_count INTEGER NOT NULL,
          freq_period_value INTEGER NOT NULL, freq_period_unit period_unit NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS area_bundle_refs (
          id SERIAL PRIMARY KEY, area_id INTEGER NOT NULL REFERENCES areas(id),
          bundle_id INTEGER NOT NULL REFERENCES task_bundles(id), sort_order INTEGER NOT NULL DEFAULT 0,
          UNIQUE(area_id, bundle_id)
        );
    """)


def downgrade() -> None:
    raise RuntimeError("Janitorial catalogue is retained data and cannot be downgraded")
