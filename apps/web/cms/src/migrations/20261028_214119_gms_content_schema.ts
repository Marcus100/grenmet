import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

/**
 * GMS Content, step 1 of 2: new select values and the new placement columns.
 * Additive only. The old Homepage columns and tables stay in place (dropping
 * them needs approval). New enum values cannot be used in the transaction that
 * adds them, so the data mapping is the next migration.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_live_posts_kind" ADD VALUE IF NOT EXISTS 'satellite';
    ALTER TYPE "public"."enum_live_posts_kind" ADD VALUE IF NOT EXISTS 'radar';
    ALTER TYPE "public"."enum_live_posts_kind" ADD VALUE IF NOT EXISTS 'wind';
    ALTER TYPE "public"."enum_live_posts_kind" ADD VALUE IF NOT EXISTS 'seas';
    ALTER TYPE "public"."enum__live_posts_v_version_kind" ADD VALUE IF NOT EXISTS 'satellite';
    ALTER TYPE "public"."enum__live_posts_v_version_kind" ADD VALUE IF NOT EXISTS 'radar';
    ALTER TYPE "public"."enum__live_posts_v_version_kind" ADD VALUE IF NOT EXISTS 'wind';
    ALTER TYPE "public"."enum__live_posts_v_version_kind" ADD VALUE IF NOT EXISTS 'seas';

    ALTER TYPE "public"."enum_desk_updates_kind" ADD VALUE IF NOT EXISTS 'forecasts';
    ALTER TYPE "public"."enum_desk_updates_kind" ADD VALUE IF NOT EXISTS 'tropical-outlook';
    ALTER TYPE "public"."enum_desk_updates_kind" ADD VALUE IF NOT EXISTS 'bulletins';
    ALTER TYPE "public"."enum_desk_updates_kind" ADD VALUE IF NOT EXISTS 'cap-warnings';
    ALTER TYPE "public"."enum_desk_updates_kind" ADD VALUE IF NOT EXISTS 'marine';
    ALTER TYPE "public"."enum_desk_updates_kind" ADD VALUE IF NOT EXISTS 'aviation';
    ALTER TYPE "public"."enum_desk_updates_kind" ADD VALUE IF NOT EXISTS 'climate';
    ALTER TYPE "public"."enum_desk_updates_kind" ADD VALUE IF NOT EXISTS 'service-notice';
    ALTER TYPE "public"."enum_desk_updates_kind" ADD VALUE IF NOT EXISTS 'community';
    ALTER TYPE "public"."enum__desk_updates_v_version_kind" ADD VALUE IF NOT EXISTS 'forecasts';
    ALTER TYPE "public"."enum__desk_updates_v_version_kind" ADD VALUE IF NOT EXISTS 'tropical-outlook';
    ALTER TYPE "public"."enum__desk_updates_v_version_kind" ADD VALUE IF NOT EXISTS 'bulletins';
    ALTER TYPE "public"."enum__desk_updates_v_version_kind" ADD VALUE IF NOT EXISTS 'cap-warnings';
    ALTER TYPE "public"."enum__desk_updates_v_version_kind" ADD VALUE IF NOT EXISTS 'marine';
    ALTER TYPE "public"."enum__desk_updates_v_version_kind" ADD VALUE IF NOT EXISTS 'aviation';
    ALTER TYPE "public"."enum__desk_updates_v_version_kind" ADD VALUE IF NOT EXISTS 'climate';
    ALTER TYPE "public"."enum__desk_updates_v_version_kind" ADD VALUE IF NOT EXISTS 'service-notice';
    ALTER TYPE "public"."enum__desk_updates_v_version_kind" ADD VALUE IF NOT EXISTS 'community';

    ALTER TYPE "public"."enum_stories_kind" ADD VALUE IF NOT EXISTS 'grenada';
    ALTER TYPE "public"."enum_stories_kind" ADD VALUE IF NOT EXISTS 'caribbean';
    ALTER TYPE "public"."enum_stories_kind" ADD VALUE IF NOT EXISTS 'world';
    ALTER TYPE "public"."enum__stories_v_version_kind" ADD VALUE IF NOT EXISTS 'grenada';
    ALTER TYPE "public"."enum__stories_v_version_kind" ADD VALUE IF NOT EXISTS 'caribbean';
    ALTER TYPE "public"."enum__stories_v_version_kind" ADD VALUE IF NOT EXISTS 'world';

    ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "lead_on_homepage" boolean DEFAULT false;
    ALTER TABLE "_stories_v" ADD COLUMN IF NOT EXISTS "version_lead_on_homepage" boolean DEFAULT false;
    ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "featured" boolean DEFAULT false;
    ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "featured_order" numeric;
    ALTER TABLE "_questions_v" ADD COLUMN IF NOT EXISTS "version_featured" boolean DEFAULT false;
    ALTER TABLE "_questions_v" ADD COLUMN IF NOT EXISTS "version_featured_order" numeric;
  `);
}

/** Enum values cannot be removed; only the new columns go. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "stories" DROP COLUMN IF EXISTS "lead_on_homepage";
    ALTER TABLE "_stories_v" DROP COLUMN IF EXISTS "version_lead_on_homepage";
    ALTER TABLE "questions" DROP COLUMN IF EXISTS "featured";
    ALTER TABLE "questions" DROP COLUMN IF EXISTS "featured_order";
    ALTER TABLE "_questions_v" DROP COLUMN IF EXISTS "version_featured";
    ALTER TABLE "_questions_v" DROP COLUMN IF EXISTS "version_featured_order";
  `);
}
