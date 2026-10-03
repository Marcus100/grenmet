from alembic import op

revision = "transport_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "DO $$ BEGIN CREATE TYPE bus_direction AS ENUM ('inbound', 'outbound'); EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    )
    op.execute(
        "DO $$ BEGIN CREATE TYPE bus_day_type AS ENUM ('daily', 'sun_hol', 'mon_sat'); EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    )
    op.execute("""
        CREATE TABLE IF NOT EXISTS routes (
          id SERIAL PRIMARY KEY, number INTEGER NOT NULL UNIQUE, name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS shifts (
          id SERIAL PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
          start_time TIME NOT NULL, end_time TIME NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS stops (
          id SERIAL PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS trips (
          id SERIAL PRIMARY KEY, route_id INTEGER NOT NULL REFERENCES routes(id),
          shift_id INTEGER NOT NULL REFERENCES shifts(id), direction bus_direction NOT NULL,
          day_type bus_day_type NOT NULL, depart_time TIME NOT NULL, arrive_time TIME,
          sort_order INTEGER NOT NULL DEFAULT 0,
          UNIQUE(route_id, shift_id, direction, day_type)
        );
        CREATE TABLE IF NOT EXISTS trip_stops (
          id SERIAL PRIMARY KEY, trip_id INTEGER NOT NULL REFERENCES trips(id),
          stop_id INTEGER NOT NULL REFERENCES stops(id), group_time TIME,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
    """)


def downgrade() -> None:
    raise RuntimeError("Transport timetable is retained data and cannot be downgraded")
