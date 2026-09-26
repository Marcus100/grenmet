"""Versioned, GTFS-aligned timetable: draft → publish with an effective date.

Additive only. The v1 ``trips`` and ``trip_stops`` tables are left untouched;
their rows are copied into the new version-scoped ``timetable_trips`` and
``timetable_stop_times`` as version 1, published. A later, separately approved
migration may retire the v1 tables once nothing reads them.

Routes, shifts and stops stay a stable reference registry (riders and runs will
point at them). Day types become service calendars (GTFS ``calendar``); public
holidays are resolved at run time from HR, so a calendar only records whether
it runs on them. Times are seconds after service-day midnight, so a night-shift
trip may pass 24:00, as GTFS allows.
"""

from alembic import op

revision = "transport_0003"
down_revision = "transport_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "DO $$ BEGIN CREATE TYPE timetable_version_status AS ENUM "
        "('draft', 'published', 'discarded'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    )
    op.execute(
        "DO $$ BEGIN CREATE TYPE trip_status AS ENUM "
        "('confirmed', 'awaiting_confirmation'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    )
    op.execute("""
        CREATE TABLE timetable_versions (
          id SERIAL PRIMARY KEY,
          label TEXT NOT NULL,
          status timetable_version_status NOT NULL DEFAULT 'draft',
          effective_date DATE,
          source_ref TEXT,
          notes TEXT,
          based_on_id INTEGER REFERENCES timetable_versions(id),
          created_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          published_by UUID,
          published_at TIMESTAMPTZ,
          CONSTRAINT timetable_versions_published_dated_ck CHECK (
            status <> 'published'
            OR (effective_date IS NOT NULL AND published_at IS NOT NULL)
          )
        );
        CREATE UNIQUE INDEX timetable_versions_single_draft_idx
          ON timetable_versions (status) WHERE status = 'draft';
        -- Several versions may share an effective date (a same-day correction);
        -- the most recently published one is in force.
        CREATE INDEX timetable_versions_in_force_idx
          ON timetable_versions (effective_date DESC, published_at DESC)
          WHERE status = 'published';

        CREATE TABLE service_calendars (
          id SERIAL PRIMARY KEY,
          slug TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          monday BOOLEAN NOT NULL, tuesday BOOLEAN NOT NULL,
          wednesday BOOLEAN NOT NULL, thursday BOOLEAN NOT NULL,
          friday BOOLEAN NOT NULL, saturday BOOLEAN NOT NULL,
          sunday BOOLEAN NOT NULL,
          runs_on_public_holidays BOOLEAN NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO service_calendars
          (slug, name, monday, tuesday, wednesday, thursday, friday, saturday,
           sunday, runs_on_public_holidays, sort_order)
        VALUES
          ('daily', 'Daily', true, true, true, true, true, true, true, true, 0),
          ('mon_sat', 'Monday to Saturday', true, true, true, true, true, true,
           false, false, 1),
          ('sun_hol', 'Sundays & public holidays', false, false, false, false,
           false, false, true, true, 2);

        ALTER TABLE routes
          ADD COLUMN description TEXT,
          ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;

        ALTER TABLE stops
          ADD COLUMN code TEXT,
          ADD COLUMN landmark TEXT,
          ADD COLUMN latitude NUMERIC(9, 6),
          ADD COLUMN longitude NUMERIC(9, 6),
          ADD COLUMN active BOOLEAN NOT NULL DEFAULT true,
          ADD CONSTRAINT stops_latitude_ck CHECK (latitude BETWEEN -90 AND 90),
          ADD CONSTRAINT stops_longitude_ck CHECK (longitude BETWEEN -180 AND 180),
          ADD CONSTRAINT stops_location_pair_ck
            CHECK ((latitude IS NULL) = (longitude IS NULL));
        UPDATE stops SET code = upper(slug);
        CREATE UNIQUE INDEX stops_code_idx ON stops (code);

        CREATE TABLE timetable_trips (
          id SERIAL PRIMARY KEY,
          version_id INTEGER NOT NULL REFERENCES timetable_versions(id),
          route_id INTEGER NOT NULL REFERENCES routes(id),
          shift_id INTEGER NOT NULL REFERENCES shifts(id),
          service_calendar_id INTEGER NOT NULL REFERENCES service_calendars(id),
          direction bus_direction NOT NULL,
          depart_seconds INTEGER NOT NULL,
          arrive_seconds INTEGER,
          status trip_status NOT NULL DEFAULT 'confirmed',
          source_ref TEXT,
          notes TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          legacy_trip_id INTEGER,
          CONSTRAINT timetable_trips_depart_ck
            CHECK (depart_seconds BETWEEN 0 AND 172799),
          CONSTRAINT timetable_trips_arrive_ck
            CHECK (arrive_seconds IS NULL OR arrive_seconds >= depart_seconds)
        );
        CREATE INDEX timetable_trips_version_route_idx
          ON timetable_trips (version_id, route_id);

        CREATE TABLE timetable_stop_times (
          id SERIAL PRIMARY KEY,
          trip_id INTEGER NOT NULL
            REFERENCES timetable_trips(id) ON DELETE CASCADE,
          stop_id INTEGER NOT NULL REFERENCES stops(id),
          stop_sequence INTEGER NOT NULL,
          departure_seconds INTEGER,
          timepoint BOOLEAN NOT NULL DEFAULT false,
          CONSTRAINT timetable_stop_times_departure_ck
            CHECK (departure_seconds BETWEEN 0 AND 172799)
        );
        CREATE UNIQUE INDEX timetable_stop_times_trip_sequence_idx
          ON timetable_stop_times (trip_id, stop_sequence);

        INSERT INTO timetable_versions
          (label, status, effective_date, source_ref, notes, published_at)
        VALUES
          -- Grenada's date, not the server's (UTC): "in force" is judged in
          -- Grenada, so a UTC date would leave no timetable in force from
          -- 20:00 to midnight local time on the day of the migration.
          ('GAA staff transport memo', 'published',
           (now() AT TIME ZONE 'America/Grenada')::date,
           'seed/transport-routes.csv',
           'Copied from the v1 catalogue when versioning was introduced.',
           now());

        INSERT INTO timetable_trips
          (version_id, route_id, shift_id, service_calendar_id, direction,
           depart_seconds, arrive_seconds, sort_order, legacy_trip_id)
        SELECT v.id, t.route_id, t.shift_id, c.id, t.direction,
               extract(epoch FROM t.depart_time)::integer,
               extract(epoch FROM t.arrive_time)::integer,
               t.sort_order, t.id
        FROM trips t
        JOIN service_calendars c ON c.slug = t.day_type::text
        CROSS JOIN (SELECT min(id) AS id FROM timetable_versions) v;

        -- v1 group times are shared by every stop in a group, so they are
        -- approximate (GTFS timepoint = 0) until someone confirms them.
        INSERT INTO timetable_stop_times
          (trip_id, stop_id, stop_sequence, departure_seconds, timepoint)
        SELECT tt.id, ts.stop_id,
               row_number() OVER (PARTITION BY ts.trip_id
                                  ORDER BY ts.sort_order, ts.id),
               extract(epoch FROM ts.group_time)::integer, false
        FROM trip_stops ts
        JOIN timetable_trips tt ON tt.legacy_trip_id = ts.trip_id;

        -- Awaiting GAA HR: the memo summary and the detailed list disagree on
        -- Route 6's times. The detailed list is kept; the trips are flagged.
        UPDATE timetable_trips SET
          status = 'awaiting_confirmation',
          notes = 'Memo summary gives 3:30 a.m. / 12 noon / 8:30 p.m.; '
                  'detailed list gives 4:30 a.m. / 1:00 p.m. / 9:30 p.m. '
                  'Awaiting GAA HR confirmation.'
        WHERE route_id IN (SELECT id FROM routes WHERE number = 6);
    """)


def downgrade() -> None:
    raise RuntimeError("Transport timetable is retained data and cannot be downgraded")
