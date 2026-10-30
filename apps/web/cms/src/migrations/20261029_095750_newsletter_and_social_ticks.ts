import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

/**
 * Two ticks on the editorial posts: "Include in newsletter" (desk updates,
 * stories, report write-ups and general live updates) and "Approve for social"
 * (the social sharing group of desk updates, stories and report write-ups).
 * Additive only: nullable-default boolean columns on each table and its
 * version table. Nothing existing is changed or dropped. The down step removes
 * only these columns.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "live_posts" ADD COLUMN "include_in_newsletter" boolean DEFAULT false;
  ALTER TABLE "_live_posts_v" ADD COLUMN "version_include_in_newsletter" boolean DEFAULT false;
  ALTER TABLE "desk_updates" ADD COLUMN "include_in_newsletter" boolean DEFAULT false;
  ALTER TABLE "desk_updates" ADD COLUMN "social_approve_for_social" boolean DEFAULT false;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_include_in_newsletter" boolean DEFAULT false;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_social_approve_for_social" boolean DEFAULT false;
  ALTER TABLE "report_notes" ADD COLUMN "include_in_newsletter" boolean DEFAULT false;
  ALTER TABLE "report_notes" ADD COLUMN "social_approve_for_social" boolean DEFAULT false;
  ALTER TABLE "_report_notes_v" ADD COLUMN "version_include_in_newsletter" boolean DEFAULT false;
  ALTER TABLE "_report_notes_v" ADD COLUMN "version_social_approve_for_social" boolean DEFAULT false;
  ALTER TABLE "stories" ADD COLUMN "include_in_newsletter" boolean DEFAULT false;
  ALTER TABLE "stories" ADD COLUMN "social_approve_for_social" boolean DEFAULT false;
  ALTER TABLE "_stories_v" ADD COLUMN "version_include_in_newsletter" boolean DEFAULT false;
  ALTER TABLE "_stories_v" ADD COLUMN "version_social_approve_for_social" boolean DEFAULT false;`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "live_posts" DROP COLUMN "include_in_newsletter";
  ALTER TABLE "_live_posts_v" DROP COLUMN "version_include_in_newsletter";
  ALTER TABLE "desk_updates" DROP COLUMN "include_in_newsletter";
  ALTER TABLE "desk_updates" DROP COLUMN "social_approve_for_social";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_include_in_newsletter";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_social_approve_for_social";
  ALTER TABLE "report_notes" DROP COLUMN "include_in_newsletter";
  ALTER TABLE "report_notes" DROP COLUMN "social_approve_for_social";
  ALTER TABLE "_report_notes_v" DROP COLUMN "version_include_in_newsletter";
  ALTER TABLE "_report_notes_v" DROP COLUMN "version_social_approve_for_social";
  ALTER TABLE "stories" DROP COLUMN "include_in_newsletter";
  ALTER TABLE "stories" DROP COLUMN "social_approve_for_social";
  ALTER TABLE "_stories_v" DROP COLUMN "version_include_in_newsletter";
  ALTER TABLE "_stories_v" DROP COLUMN "version_social_approve_for_social";`);
}
