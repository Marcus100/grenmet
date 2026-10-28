"""Events catalogue taxonomy (ADR-0046): categories and listing classification.

Additive and reversible. Creates ``events.categories`` (two levels, seeded with
the adopted taxonomy) and adds nullable or defaulted columns to
``events.listings``: ``listing_type``, ``access_type``, ``pricing_type``,
``booking_mode``, ``category_id``, ``subcategory_id``, ``external_ticket_url``
and ``curated``. The frozen ``category`` column and its CHECK are untouched.

Backfill: ``pricing_type`` is ``paid`` where any tier price is above zero;
``booking_mode`` follows the legacy ``admission`` (free -> none, rsvp -> rsvp,
ticketed -> tickets). ``category_id`` (and ``subcategory_id`` for faith) comes
from the frozen ten-value ``category`` through this provisional, lossy table
(owner to confirm; amend LEGACY_TO_CATEGORY below):

    fete      -> parties-fetes
    music     -> music-live-shows
    food      -> food-drink
    sport     -> sports-fitness
    business  -> business-learning
    tech      -> business-learning, plus the tag ``tech``
    culture   -> arts-culture   (Tours and Markets also map back to culture)
    faith     -> community-causes, subcategory church-faith
    family    -> community-causes, plus the tag ``kid-friendly``
    wellness  -> sports-fitness (the Wellness category stays inactive)

Notes:

* ``curated`` is a stopgap boolean; ADR-0048's ``origin`` field will replace it.
* The downgrade does not remove the tags ``kid-friendly`` and ``tech`` that the
  backfill appended; they are harmless free tags.
* Constraints are added ``NOT VALID`` and then validated, and the upgrade sets a
  short ``lock_timeout`` so it fails fast instead of queueing behind traffic.

Revision ID: eventstaxonomy20261022
Revises: caplibrarymanage20261027
"""

import uuid

import sqlalchemy as sa

from alembic import op

revision = "eventstaxonomy20261022"
down_revision = "caplibrarymanage20261027"
branch_labels = None
depends_on = None

LISTING_TYPES = "'event', 'experience', 'class', 'attraction', 'service'"
LEGACY = (
    "'fete', 'music', 'food', 'sport', 'business', 'tech', 'culture', 'faith', "
    "'family', 'wellness'"
)

EVENT = ["event"]
ALL_THREE = ["event", "experience", "class"]

# (slug, name, applies_to, legacy_category, active, [(slug, name), ...])
TAXONOMY = [
    (
        "parties-fetes",
        "Parties & Fetes",
        EVENT,
        "fete",
        True,
        [
            ("all-inclusive-fete", "All-inclusive fete"),
            ("paint-colour-fete", "Paint / colour fete"),
            ("cooler-fete", "Cooler fete"),
            ("breakfast-fete", "Breakfast fete"),
            ("boat-fete", "Boat fete"),
            ("beach-party", "Beach party"),
            ("club-night", "Club night"),
            ("jouvert", "J'ouvert"),
            ("after-party", "After-party"),
        ],
    ),
    (
        "music-live-shows",
        "Music & Live Shows",
        EVENT,
        "music",
        True,
        [
            ("concert", "Concert"),
            ("calypso-soca-competition", "Calypso / soca competition"),
            ("pan", "Pan"),
            ("dj-set", "DJ set"),
            ("jam", "Jam"),
            ("comedy", "Comedy"),
            ("theatre", "Theatre"),
            ("dance", "Dance"),
        ],
    ),
    (
        "tours-outdoors",
        "Tours & Outdoors",
        ["event", "experience", "attraction"],
        "culture",
        True,
        [
            ("boat-cruises", "Boat & cruises"),
            ("snorkel-dive", "Snorkel / dive"),
            ("hiking", "Hiking"),
            ("island-hopping", "Island hopping"),
            ("sightseeing", "Sightseeing"),
            ("day-trips", "Day trips"),
            ("water-sports", "Water sports"),
        ],
    ),
    (
        "food-drink",
        "Food & Drink",
        ALL_THREE,
        "food",
        True,
        [
            ("breakfast-brunch", "Breakfast / brunch"),
            ("tasting", "Tasting"),
            ("rum-chocolate-spice-tours", "Rum / chocolate / spice tours"),
            ("cooking-class", "Cooking class"),
            ("food-festival", "Food festival"),
            ("dinner", "Dinner"),
        ],
    ),
    (
        "sports-fitness",
        "Sports & Fitness",
        ALL_THREE,
        "sport",
        True,
        [
            ("regatta", "Regatta"),
            ("road-race", "Road race"),
            ("football", "Football"),
            ("cricket", "Cricket"),
            ("yoga", "Yoga"),
            ("gym-classes", "Gym classes"),
        ],
    ),
    (
        "arts-culture",
        "Arts & Culture",
        ["event", "class", "attraction"],
        "culture",
        True,
        [
            ("arts-festival", "Festival"),
            ("exhibition", "Exhibition"),
            ("heritage", "Heritage"),
            ("storytelling", "Storytelling"),
            ("parade", "Parade"),
            ("film", "Film"),
        ],
    ),
    (
        "business-learning",
        "Business & Learning",
        ["event", "class"],
        "business",
        True,
        [
            ("masterclass", "Masterclass"),
            ("workshop", "Workshop"),
            ("conference", "Conference"),
            ("networking", "Networking"),
            ("training", "Training"),
        ],
    ),
    (
        "markets-shopping",
        "Markets & Shopping",
        EVENT,
        "culture",
        True,
        [
            ("craft-market", "Craft market"),
            ("pop-up", "Pop-up"),
            ("farmers-market", "Farmers market"),
            ("sale", "Sale"),
        ],
    ),
    (
        "community-causes",
        "Community & Causes",
        EVENT,
        "faith",
        True,
        [
            ("bingo", "Bingo"),
            ("fundraiser", "Fundraiser"),
            ("charity", "Charity"),
            ("church-faith", "Church / faith"),
            ("town-hall", "Town hall"),
            ("volunteering", "Volunteering"),
        ],
    ),
    # Inactive until volume justifies it (ADR-0046); no subcategories.
    ("wellness", "Wellness", ALL_THREE, "wellness", False, []),
]


# legacy value -> (category slug, subcategory slug or None)
LEGACY_TO_CATEGORY = {
    "fete": ("parties-fetes", None),
    "music": ("music-live-shows", None),
    "food": ("food-drink", None),
    "sport": ("sports-fitness", None),
    "business": ("business-learning", None),
    "tech": ("business-learning", None),
    "culture": ("arts-culture", None),
    "faith": ("community-causes", "church-faith"),
    "family": ("community-causes", None),
    "wellness": ("sports-fitness", None),
}


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.execute(
        f"""
        CREATE TABLE events.categories (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            slug text NOT NULL,
            name text NOT NULL,
            parent_id uuid,
            applies_to text[] DEFAULT '{{}}'::text[] NOT NULL,
            sort_order integer DEFAULT 0 NOT NULL,
            active boolean DEFAULT true NOT NULL,
            legacy_category text,
            CONSTRAINT categories_slug_key UNIQUE (slug),
            CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id)
                REFERENCES events.categories(id),
            CONSTRAINT categories_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id),
            CONSTRAINT categories_legacy_category_check
                CHECK (legacy_category IS NULL OR legacy_category IN ({LEGACY})),
            CONSTRAINT categories_applies_to_check
                CHECK (applies_to <@ ARRAY[{LISTING_TYPES}]::text[])
        );
        CREATE INDEX categories_parent_id_idx ON events.categories (parent_id);
        """
    )

    categories = sa.table(
        "categories",
        sa.column("id", sa.Uuid()),
        sa.column("slug", sa.Text()),
        sa.column("name", sa.Text()),
        sa.column("parent_id", sa.Uuid()),
        sa.column("applies_to", sa.ARRAY(sa.Text())),
        sa.column("sort_order", sa.Integer()),
        sa.column("active", sa.Boolean()),
        sa.column("legacy_category", sa.Text()),
        schema="events",
    )
    top_rows: list[dict[str, object]] = []
    sub_rows: list[dict[str, object]] = []
    for order, (slug, name, applies, legacy, active, subs) in enumerate(
        TAXONOMY, start=1
    ):
        parent_id = uuid.uuid5(uuid.NAMESPACE_URL, f"barrels-events-category:{slug}")
        top_rows.append(
            {
                "id": parent_id,
                "slug": slug,
                "name": name,
                "parent_id": None,
                "applies_to": applies,
                "sort_order": order * 10,
                "active": active,
                "legacy_category": legacy,
            }
        )
        for sub_order, (sub_slug, sub_name) in enumerate(subs, start=1):
            sub_rows.append(
                {
                    "id": uuid.uuid5(
                        uuid.NAMESPACE_URL, f"barrels-events-category:{sub_slug}"
                    ),
                    "slug": sub_slug,
                    "name": sub_name,
                    "parent_id": parent_id,
                    "applies_to": applies,
                    "sort_order": sub_order * 10,
                    "active": active,
                    "legacy_category": legacy,
                }
            )
    op.bulk_insert(categories, top_rows)
    op.bulk_insert(categories, sub_rows)

    op.execute(
        """
        ALTER TABLE events.listings
            ADD COLUMN listing_type text DEFAULT 'event' NOT NULL,
            ADD COLUMN access_type text DEFAULT 'public' NOT NULL,
            ADD COLUMN pricing_type text DEFAULT 'free' NOT NULL,
            ADD COLUMN booking_mode text DEFAULT 'none' NOT NULL,
            ADD COLUMN category_id uuid,
            ADD COLUMN subcategory_id uuid,
            ADD COLUMN external_ticket_url text,
            ADD COLUMN curated boolean DEFAULT false NOT NULL;

        UPDATE events.listings l SET pricing_type = 'paid'
        WHERE EXISTS (
            SELECT 1 FROM events.ticket_tiers t
            WHERE t.listing_id = l.id AND t.price_minor > 0
        ) AND l.admission = 'ticketed';

        UPDATE events.listings SET booking_mode = CASE admission
            WHEN 'rsvp' THEN 'rsvp'
            ELSE 'tickets'
        END
        WHERE admission IN ('rsvp', 'ticketed');

        """
    )
    _backfill_categories()
    op.execute(
        f"""
        ALTER TABLE events.listings
            ADD CONSTRAINT listings_listing_type_check
                CHECK (listing_type IN ({LISTING_TYPES})) NOT VALID,
            ADD CONSTRAINT listings_access_type_check
                CHECK (access_type IN ('public', 'private')) NOT VALID,
            ADD CONSTRAINT listings_pricing_type_check
                CHECK (pricing_type IN ('free', 'paid', 'donation')) NOT VALID,
            ADD CONSTRAINT listings_booking_mode_check
                CHECK (booking_mode IN
                    ('rsvp', 'tickets', 'slots', 'enquiry', 'none', 'external'))
                NOT VALID,
            ADD CONSTRAINT listings_private_is_unlisted_check
                CHECK (access_type = 'public' OR visibility = 'unlisted') NOT VALID,
            ADD CONSTRAINT listings_external_ticket_url_check
                CHECK (external_ticket_url IS NULL OR (
                    booking_mode = 'external'
                    AND external_ticket_url LIKE 'https://%'
                    AND char_length(external_ticket_url) <= 500
                )) NOT VALID,
            ADD CONSTRAINT listings_curated_is_public_check
                CHECK (NOT curated OR access_type = 'public') NOT VALID,
            ADD CONSTRAINT listings_category_id_fkey
                FOREIGN KEY (category_id) REFERENCES events.categories(id)
                NOT VALID,
            ADD CONSTRAINT listings_subcategory_id_fkey
                FOREIGN KEY (subcategory_id) REFERENCES events.categories(id)
                NOT VALID;
        ALTER TABLE events.listings VALIDATE CONSTRAINT listings_listing_type_check;
        ALTER TABLE events.listings VALIDATE CONSTRAINT listings_access_type_check;
        ALTER TABLE events.listings VALIDATE CONSTRAINT listings_pricing_type_check;
        ALTER TABLE events.listings VALIDATE CONSTRAINT listings_booking_mode_check;
        ALTER TABLE events.listings VALIDATE CONSTRAINT listings_private_is_unlisted_check;
        ALTER TABLE events.listings VALIDATE CONSTRAINT listings_external_ticket_url_check;
        ALTER TABLE events.listings VALIDATE CONSTRAINT listings_curated_is_public_check;
        ALTER TABLE events.listings VALIDATE CONSTRAINT listings_category_id_fkey;
        ALTER TABLE events.listings VALIDATE CONSTRAINT listings_subcategory_id_fkey;
        CREATE INDEX listings_category_id_idx ON events.listings (category_id);
        CREATE INDEX listings_subcategory_id_idx ON events.listings (subcategory_id);
        """
    )


def _backfill_categories() -> None:
    for legacy, (category, sub) in LEGACY_TO_CATEGORY.items():
        op.execute(
            sa.text(
                "UPDATE events.listings SET "
                "category_id = (SELECT id FROM events.categories WHERE slug = :cat), "
                "subcategory_id = (SELECT id FROM events.categories WHERE slug = :sub) "
                "WHERE category = :legacy"
            ).bindparams(cat=category, sub=sub, legacy=legacy)
        )
    op.execute(
        "UPDATE events.listings SET tags = array_append(tags, 'kid-friendly') "
        "WHERE category = 'family' AND NOT ('kid-friendly' = ANY(tags))"
    )
    op.execute(
        "UPDATE events.listings SET tags = array_append(tags, 'tech') "
        "WHERE category = 'tech' AND NOT ('tech' = ANY(tags))"
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX events.listings_subcategory_id_idx;
        DROP INDEX events.listings_category_id_idx;
        ALTER TABLE events.listings
            DROP CONSTRAINT listings_subcategory_id_fkey,
            DROP CONSTRAINT listings_category_id_fkey,
            DROP CONSTRAINT listings_curated_is_public_check,
            DROP CONSTRAINT listings_external_ticket_url_check,
            DROP CONSTRAINT listings_private_is_unlisted_check,
            DROP CONSTRAINT listings_booking_mode_check,
            DROP CONSTRAINT listings_pricing_type_check,
            DROP CONSTRAINT listings_access_type_check,
            DROP CONSTRAINT listings_listing_type_check,
            DROP COLUMN curated,
            DROP COLUMN external_ticket_url,
            DROP COLUMN subcategory_id,
            DROP COLUMN category_id,
            DROP COLUMN booking_mode,
            DROP COLUMN pricing_type,
            DROP COLUMN access_type,
            DROP COLUMN listing_type;
        DROP TABLE events.categories;
        """
    )
