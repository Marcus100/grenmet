"""Reference data v2, contractor staff, building scope and shifts.

Additive. Existing ids are kept so printed area codes and any stored
references stay valid:

- ``sites`` (MBIA ``GND``, Lauriston ``CRU``) sit above ``buildings``.
- Each area of the old "Auxiliary Buildings" placeholder becomes its own
  ``auxiliary`` building. The area keeps its id and tasks and is renamed
  "Whole building"; the emptied placeholder is deactivated, not deleted.
- Areas gain a printable ``code``, ``space_type``, APPA ``cleanliness_level``
  and ``quantity``. A BEFORE INSERT trigger fills code and inferred type/level,
  so seeded and migrated databases agree.
- People, scope, shift and history tables follow the Clean conventions in
  ``docs/products/gaa-clean-quality-cms-proposals.md``: UUID keys, a positive
  ``revision`` checked on every write, history in the same transaction, and no
  hard deletes. Identities are Barrels Login user UUIDs (no cross-database FK).
"""

from alembic import op

revision = "janitorial_0002"
down_revision = "janitorial_0001"
branch_labels = None
depends_on = None

EDITABLE = (
    "active BOOLEAN NOT NULL DEFAULT true, "
    "revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)"
)
TRACKED = (
    f"{EDITABLE}, created_by UUID NOT NULL, "
    "created_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
    "updated_at TIMESTAMPTZ NOT NULL DEFAULT now()"
)
SPACE_TYPES = (
    "restroom",
    "office",
    "concourse",
    "lounge",
    "circulation",
    "vertical_transport",
    "boarding",
    "food",
    "storage",
    "technical",
    "exterior",
    "other",
)


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE sites (
          id SERIAL PRIMARY KEY,
          code TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{{3}}$'),
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          {EDITABLE}
        );
        INSERT INTO sites (id, code, name, sort_order) VALUES
          (1, 'GND', 'Maurice Bishop International Airport', 1),
          (2, 'CRU', 'Lauriston Airport', 2);
        SELECT setval(pg_get_serial_sequence('sites', 'id'), 2);

        ALTER TABLE buildings
          ADD COLUMN site_id INTEGER REFERENCES sites(id) ON DELETE RESTRICT,
          ADD COLUMN kind TEXT NOT NULL DEFAULT 'other'
            CHECK (kind IN ('terminal', 'auxiliary', 'other')),
          ADD COLUMN active BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);
        UPDATE buildings SET site_id = 1;
        ALTER TABLE buildings ALTER COLUMN site_id SET NOT NULL;
        UPDATE buildings SET kind = 'terminal' WHERE name ILIKE '%terminal%';

        ALTER TABLE sections
          ADD COLUMN note TEXT,
          ADD COLUMN active BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);
        ALTER TABLE area_tasks
          ADD COLUMN active BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);
        ALTER TABLE task_bundle_items
          ADD COLUMN active BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);
    """)  # noqa: S608 -- interpolates module constants only

    # Promote the auxiliary structures to buildings of their own.
    op.execute("""
        DO $$
        DECLARE
          placeholder INTEGER;
          aux RECORD;
          next_order INTEGER;
          slug TEXT;
          promoted INTEGER;
        BEGIN
          SELECT id INTO placeholder FROM buildings WHERE name = 'Auxiliary Buildings';
          IF placeholder IS NULL THEN
            RETURN;
          END IF;
          SELECT COALESCE(MAX(sort_order), 0) INTO next_order FROM buildings;
          FOR aux IN
            SELECT id, name FROM areas
            WHERE building_id = placeholder AND section_id IS NULL
            ORDER BY sort_order, id
          LOOP
            next_order := next_order + 1;
            slug := trim(both '-' from regexp_replace(lower(aux.name), '[^a-z0-9]+', '-', 'g'));
            IF EXISTS (SELECT 1 FROM buildings WHERE code = slug) THEN
              slug := slug || '-' || aux.id;
            END IF;
            INSERT INTO buildings (name, code, sort_order, site_id, kind)
            VALUES (aux.name, slug, next_order, 1, 'auxiliary')
            RETURNING id INTO promoted;
            UPDATE areas SET building_id = promoted, name = 'Whole building', sort_order = 0
            WHERE id = aux.id;
          END LOOP;
          UPDATE buildings SET active = false
          WHERE id = placeholder
            AND NOT EXISTS (SELECT 1 FROM areas WHERE building_id = placeholder);
        END $$;
    """)

    space_types = ", ".join(f"'{value}'" for value in SPACE_TYPES)
    op.execute(f"""
        CREATE OR REPLACE FUNCTION janitorial_space_type(area_name TEXT)
        RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
          SELECT CASE
            WHEN area_name ~* '(rest ?room|washroom|toilet|bathroom|lavator|shower)' THEN 'restroom'
            WHEN area_name ~* '(elevator|escalator|lift|stair)' THEN 'vertical_transport'
            WHEN area_name ~* '(boarding|jet ?bridge|gate)' THEN 'boarding'
            WHEN area_name ~* '(lounge|vip)' THEN 'lounge'
            WHEN area_name ~* '(concourse|departure|arrival|check.?in|baggage|immigration|customs|hall|lobby|waiting)' THEN 'concourse'
            WHEN area_name ~* '(corridor|hallway|walkway|passage|entrance|foyer)' THEN 'circulation'
            WHEN area_name ~* '(kitchen|lunch ?room|canteen|cafeteria|food|restaurant|pantry)' THEN 'food'
            WHEN area_name ~* '(store|warehouse|storage|shed)' THEN 'storage'
            WHEN area_name ~* '(plant|lab|workshop|maintenance|tower|tech|server|electrical|mechanical)' THEN 'technical'
            WHEN area_name ~* '(car ?park|parking|kerb|curb|exterior|outdoor|apron|booth|hut)' THEN 'exterior'
            WHEN area_name ~* '(office|meeting|conference|reception|board ?room|admin)' THEN 'office'
            ELSE 'other'
          END
        $fn$;

        -- Target APPA level (1 = orderly spotlessness) for a space type.
        CREATE OR REPLACE FUNCTION janitorial_cleanliness_level(space_type TEXT)
        RETURNS SMALLINT LANGUAGE sql IMMUTABLE AS $fn$
          SELECT (CASE
            WHEN space_type IN ('restroom', 'concourse', 'lounge', 'boarding', 'food') THEN 1
            WHEN space_type IN ('vertical_transport', 'circulation', 'office') THEN 2
            WHEN space_type IN ('storage', 'technical', 'exterior') THEN 3
          END)::SMALLINT
        $fn$;

        ALTER TABLE areas
          ADD COLUMN code TEXT UNIQUE,
          ADD COLUMN space_type TEXT,
          ADD COLUMN cleanliness_level SMALLINT CHECK (cleanliness_level BETWEEN 1 AND 5),
          ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
          ADD COLUMN active BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);

        CREATE OR REPLACE FUNCTION janitorial_area_defaults()
        RETURNS trigger LANGUAGE plpgsql AS $fn$
        BEGIN
          IF NEW.code IS NULL THEN
            NEW.code := (
              SELECT s.code FROM buildings b JOIN sites s ON s.id = b.site_id
              WHERE b.id = NEW.building_id
            ) || '-A' || lpad(NEW.id::text, 4, '0');
          END IF;
          IF NEW.space_type IS NULL THEN
            NEW.space_type := janitorial_space_type(NEW.name);
            IF NEW.cleanliness_level IS NULL THEN
              NEW.cleanliness_level := janitorial_cleanliness_level(NEW.space_type);
            END IF;
          END IF;
          RETURN NEW;
        END
        $fn$;

        -- Promoted auxiliary areas are named "Whole building"; infer from the building.
        UPDATE areas a SET
          code = s.code || '-A' || lpad(a.id::text, 4, '0'),
          space_type = janitorial_space_type(
            CASE WHEN b.kind = 'auxiliary' THEN b.name ELSE a.name END
          )
        FROM buildings b JOIN sites s ON s.id = b.site_id
        WHERE b.id = a.building_id;
        UPDATE areas SET cleanliness_level = janitorial_cleanliness_level(space_type);

        ALTER TABLE areas
          ALTER COLUMN code SET NOT NULL,
          ALTER COLUMN space_type SET NOT NULL,
          ADD CONSTRAINT areas_space_type_check CHECK (space_type IN ({space_types}));
        CREATE TRIGGER areas_defaults BEFORE INSERT ON areas
          FOR EACH ROW EXECUTE FUNCTION janitorial_area_defaults();
    """)  # noqa: S608 -- interpolates module constants only

    op.execute(f"""
        CREATE TABLE contractors (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 200),
          {TRACKED}
        );
        CREATE TABLE staff (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL UNIQUE,
          contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE RESTRICT,
          role TEXT NOT NULL CHECK (role IN ('cleaner', 'contractor_supervisor')),
          badge_no TEXT CHECK (length(badge_no) BETWEEN 1 AND 40),
          {TRACKED}
        );
        CREATE UNIQUE INDEX staff_badge_no_key ON staff (badge_no) WHERE badge_no IS NOT NULL;

        CREATE TABLE building_grants (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE RESTRICT,
          granted_by UUID NOT NULL,
          granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          revoked_by UUID,
          revoked_at TIMESTAMPTZ,
          CHECK ((revoked_by IS NULL) = (revoked_at IS NULL))
        );
        CREATE UNIQUE INDEX building_grants_active_key
          ON building_grants (user_id, building_id) WHERE revoked_at IS NULL;

        CREATE TABLE shift_patterns (
          id SERIAL PRIMARY KEY,
          site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
          name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
          starts_at TIME NOT NULL,
          ends_at TIME NOT NULL CHECK (ends_at <> starts_at),
          sort_order INTEGER NOT NULL DEFAULT 0,
          {EDITABLE},
          UNIQUE (site_id, name)
        );
        CREATE TABLE zones (
          id SERIAL PRIMARY KEY,
          site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
          name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
          {EDITABLE},
          UNIQUE (site_id, name)
        );
        CREATE TABLE zone_areas (
          zone_id INTEGER NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
          area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE RESTRICT,
          PRIMARY KEY (zone_id, area_id)
        );
        CREATE TABLE shift_assignments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          work_date DATE NOT NULL,
          shift_pattern_id INTEGER NOT NULL REFERENCES shift_patterns(id) ON DELETE RESTRICT,
          staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
          zone_id INTEGER NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
          status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
          note TEXT CHECK (length(note) <= 4000),
          revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
          created_by UUID NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX shift_assignments_active_key
          ON shift_assignments (work_date, shift_pattern_id, staff_id)
          WHERE status = 'scheduled';
        CREATE INDEX shift_assignments_work_date_idx ON shift_assignments (work_date);

        CREATE TABLE change_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          entity TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision > 0),
          action TEXT NOT NULL,
          actor_id UUID NOT NULL,
          recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          changes JSONB NOT NULL DEFAULT '{{}}'::jsonb,
          UNIQUE (entity, entity_id, revision)
        );
    """)


def downgrade() -> None:
    raise RuntimeError(
        "Janitorial reference, staff and shift records are retained data "
        "and cannot be downgraded"
    )
