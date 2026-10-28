import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

/**
 * Related links you paste: title and category become optional (filled in on
 * save), and one link per post can be the main link. Each post's old single
 * Weather product becomes its first, main related link (a site path the
 * weather site reads as an issued product). The old product columns stay.
 */
const CATEGORY = `CASE %s
        WHEN 'morning' THEN 'forecast' WHEN 'midday' THEN 'forecast'
        WHEN 'evening' THEN 'forecast' WHEN 'outlook' THEN 'forecast'
        WHEN 'cyclone' THEN 'bulletin' WHEN 'marine' THEN 'bulletin'
        WHEN 'flood' THEN 'bulletin' WHEN 'thunderstorm' THEN 'bulletin'
        WHEN 'wind' THEN 'bulletin' WHEN 'heat' THEN 'bulletin'
        WHEN 'dust' THEN 'bulletin' WHEN 'coastal' THEN 'bulletin'
        WHEN 'tsunami' THEN 'bulletin' ELSE 'forecast' END`;
const TITLE = `CASE %s
        WHEN 'morning' THEN 'Morning Forecast' WHEN 'midday' THEN 'Midday Forecast'
        WHEN 'evening' THEN 'Evening Forecast' WHEN 'outlook' THEN 'Tropical Weather Outlook'
        WHEN 'cyclone' THEN 'Tropical Cyclone Bulletin' WHEN 'marine' THEN 'Marine / Small Craft Bulletin'
        WHEN 'flood' THEN 'Flood / Heavy Rain Bulletin' WHEN 'thunderstorm' THEN 'Thunderstorm Bulletin'
        WHEN 'wind' THEN 'Wind Bulletin' WHEN 'heat' THEN 'Heat Bulletin'
        WHEN 'dust' THEN 'Dust / Haze Bulletin' WHEN 'coastal' THEN 'Coastal Hazard Bulletin'
        WHEN 'tsunami' THEN 'Tsunami Bulletin' ELSE 'Issued product' END`;

/** Moves one product pointer into the first related link of its post. */
function moveProduct(args: {
  linkTable: string;
  parentTable: string;
  productId: string;
  kind: string;
  categoryType: string;
  /** Live link rows have text ids; version rows use a serial id. */
  textId: boolean;
}): string {
  const { linkTable, parentTable, productId, kind, categoryType, textId } =
    args;
  const has = (alias: string) =>
    `${alias}"${productId}" IS NOT NULL AND ${alias}"${productId}" <> ''`;
  return `
    UPDATE "${linkTable}" SET "_order" = "_order" + 1
      WHERE "_parent_id" IN (SELECT "id" FROM "${parentTable}" WHERE ${has("")});
    INSERT INTO "${linkTable}" ("_order", "_parent_id", ${textId ? '"id", ' : ""}"title", "category", "url", "is_main")
      SELECT 1, p."id", ${textId ? `md5(random()::text || clock_timestamp()::text || p."id"::text), ` : ""}
        ${TITLE.replaceAll("%s", `p."${kind}"::text`)},
        (${CATEGORY.replace("%s", `p."${kind}"::text`)})::"public"."${categoryType}",
        '/weather/issued/' || p."${productId}", true
      FROM "${parentTable}" p WHERE ${has("p.")};
  `;
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "live_posts_related_links" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "live_posts_related_links" ALTER COLUMN "category" DROP NOT NULL;
  ALTER TABLE "_live_posts_v_version_related_links" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "_live_posts_v_version_related_links" ALTER COLUMN "category" DROP NOT NULL;
  ALTER TABLE "desk_updates_related_links" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "desk_updates_related_links" ALTER COLUMN "category" DROP NOT NULL;
  ALTER TABLE "_desk_updates_v_version_related_links" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "_desk_updates_v_version_related_links" ALTER COLUMN "category" DROP NOT NULL;
  ALTER TABLE "report_notes_related_links" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "report_notes_related_links" ALTER COLUMN "category" DROP NOT NULL;
  ALTER TABLE "_report_notes_v_version_related_links" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "_report_notes_v_version_related_links" ALTER COLUMN "category" DROP NOT NULL;
  ALTER TABLE "stories_related_links" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "stories_related_links" ALTER COLUMN "category" DROP NOT NULL;
  ALTER TABLE "_stories_v_version_related_links" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "_stories_v_version_related_links" ALTER COLUMN "category" DROP NOT NULL;
  ALTER TABLE "questions_related_links" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "questions_related_links" ALTER COLUMN "category" DROP NOT NULL;
  ALTER TABLE "_questions_v_version_related_links" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "_questions_v_version_related_links" ALTER COLUMN "category" DROP NOT NULL;
  ALTER TABLE "live_posts_related_links" ADD COLUMN "is_main" boolean DEFAULT false;
  ALTER TABLE "_live_posts_v_version_related_links" ADD COLUMN "is_main" boolean DEFAULT false;
  ALTER TABLE "desk_updates_related_links" ADD COLUMN "is_main" boolean DEFAULT false;
  ALTER TABLE "_desk_updates_v_version_related_links" ADD COLUMN "is_main" boolean DEFAULT false;
  ALTER TABLE "report_notes_related_links" ADD COLUMN "is_main" boolean DEFAULT false;
  ALTER TABLE "_report_notes_v_version_related_links" ADD COLUMN "is_main" boolean DEFAULT false;
  ALTER TABLE "stories_related_links" ADD COLUMN "is_main" boolean DEFAULT false;
  ALTER TABLE "_stories_v_version_related_links" ADD COLUMN "is_main" boolean DEFAULT false;
  ALTER TABLE "questions_related_links" ADD COLUMN "is_main" boolean DEFAULT false;
  ALTER TABLE "_questions_v_version_related_links" ADD COLUMN "is_main" boolean DEFAULT false;
  `);
  await db.execute(
    sql.raw(
      moveProduct({
        linkTable: "desk_updates_related_links",
        parentTable: "desk_updates",
        productId: "linked_product_product_id",
        kind: "linked_product_kind",
        categoryType: "enum_desk_updates_related_links_category",
        textId: true,
      })
    )
  );
  await db.execute(
    sql.raw(
      moveProduct({
        linkTable: "_desk_updates_v_version_related_links",
        parentTable: "_desk_updates_v",
        productId: "version_linked_product_product_id",
        kind: "version_linked_product_kind",
        categoryType: "enum__desk_updates_v_version_related_links_category",
        textId: false,
      })
    )
  );
  await db.execute(
    sql.raw(
      moveProduct({
        linkTable: "report_notes_related_links",
        parentTable: "report_notes",
        productId: "linked_product_product_id",
        kind: "linked_product_kind",
        categoryType: "enum_report_notes_related_links_category",
        textId: true,
      })
    )
  );
  await db.execute(
    sql.raw(
      moveProduct({
        linkTable: "_report_notes_v_version_related_links",
        parentTable: "_report_notes_v",
        productId: "version_linked_product_product_id",
        kind: "version_linked_product_kind",
        categoryType: "enum__report_notes_v_version_related_links_category",
        textId: false,
      })
    )
  );
}

/** Only the new column goes; the relaxed title and category stay relaxed. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "live_posts_related_links" DROP COLUMN IF EXISTS "is_main";
    ALTER TABLE "_live_posts_v_version_related_links" DROP COLUMN IF EXISTS "is_main";
    ALTER TABLE "desk_updates_related_links" DROP COLUMN IF EXISTS "is_main";
    ALTER TABLE "_desk_updates_v_version_related_links" DROP COLUMN IF EXISTS "is_main";
    ALTER TABLE "report_notes_related_links" DROP COLUMN IF EXISTS "is_main";
    ALTER TABLE "_report_notes_v_version_related_links" DROP COLUMN IF EXISTS "is_main";
    ALTER TABLE "stories_related_links" DROP COLUMN IF EXISTS "is_main";
    ALTER TABLE "_stories_v_version_related_links" DROP COLUMN IF EXISTS "is_main";
    ALTER TABLE "questions_related_links" DROP COLUMN IF EXISTS "is_main";
    ALTER TABLE "_questions_v_version_related_links" DROP COLUMN IF EXISTS "is_main";
  `);
}
