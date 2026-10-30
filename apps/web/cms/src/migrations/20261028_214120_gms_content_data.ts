import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

/**
 * GMS Content, step 2 of 2: carry existing posts and Homepage settings over.
 * - Desk updates: the old Kind and Product topic become one "About" value
 *   (Product wins when set, as it is the more specific).
 * - Stories: Local weather story, Weather event and Community impact become
 *   Grenada weather; Climate, Ocean and Explainer are unchanged.
 * - Lead story and featured questions move from the Homepage global onto the
 *   posts. The old Homepage columns and tables are left in place.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "desk_updates" SET "kind" = CASE "kind"::text
      WHEN 'product-update' THEN 'announcement'
      WHEN 'service-update' THEN 'service-notice'
      WHEN 'public-notice' THEN 'service-notice'
      WHEN 'community-update' THEN 'community'
      ELSE "kind"::text END::"public"."enum_desk_updates_kind";
    UPDATE "desk_updates" SET "kind" = CASE "product"::text
      WHEN 'tropical-outlook' THEN 'tropical-outlook'
      WHEN 'bulletins' THEN 'bulletins'
      WHEN 'forecasts' THEN 'forecasts'
      WHEN 'marine' THEN 'marine'
      WHEN 'aviation' THEN 'aviation'
      WHEN 'cap' THEN 'cap-warnings'
      END::"public"."enum_desk_updates_kind"
      WHERE "product" IS NOT NULL;

    UPDATE "_desk_updates_v" SET "version_kind" = CASE "version_kind"::text
      WHEN 'product-update' THEN 'announcement'
      WHEN 'service-update' THEN 'service-notice'
      WHEN 'public-notice' THEN 'service-notice'
      WHEN 'community-update' THEN 'community'
      ELSE "version_kind"::text END::"public"."enum__desk_updates_v_version_kind";
    UPDATE "_desk_updates_v" SET "version_kind" = CASE "version_product"::text
      WHEN 'tropical-outlook' THEN 'tropical-outlook'
      WHEN 'bulletins' THEN 'bulletins'
      WHEN 'forecasts' THEN 'forecasts'
      WHEN 'marine' THEN 'marine'
      WHEN 'aviation' THEN 'aviation'
      WHEN 'cap' THEN 'cap-warnings'
      END::"public"."enum__desk_updates_v_version_kind"
      WHERE "version_product" IS NOT NULL;

    UPDATE "stories" SET "kind" = 'grenada'
      WHERE "kind"::text IN ('local-story', 'weather-event', 'community');
    UPDATE "_stories_v" SET "version_kind" = 'grenada'
      WHERE "version_kind"::text IN ('local-story', 'weather-event', 'community');
    ALTER TABLE "stories" ALTER COLUMN "kind" SET DEFAULT 'grenada';
    ALTER TABLE "_stories_v" ALTER COLUMN "version_kind" SET DEFAULT 'grenada';

    UPDATE "stories" SET "lead_on_homepage" = true
      WHERE "id" IN (SELECT "lead_story_id" FROM "homepage" WHERE "lead_story_id" IS NOT NULL);
    UPDATE "questions" AS q SET "featured" = true, "featured_order" = r."order"
      FROM "homepage_rels" AS r
      WHERE r."path" = 'featuredQuestions' AND r."questions_id" = q."id" AND r."order" <= 5;
  `);
}

/** The old values are not kept per row, so this data move is not reversed. */
export async function down(_args: MigrateDownArgs): Promise<void> {
  // Intentionally empty: see the up migration.
}
