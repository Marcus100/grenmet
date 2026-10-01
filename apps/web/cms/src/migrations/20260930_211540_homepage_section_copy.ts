import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

/** Homepage section wording and Explore today read-more links (additive). */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_homepage_hidden_sections" ADD VALUE 'explore-today';
  ALTER TYPE "public"."enum_homepage_hidden_sections" ADD VALUE 'grenada-in-data';
  ALTER TYPE "public"."enum__homepage_v_version_hidden_sections" ADD VALUE 'explore-today';
  ALTER TYPE "public"."enum__homepage_v_version_hidden_sections" ADD VALUE 'grenada-in-data';
  ALTER TABLE "homepage" ADD COLUMN "section_copy_weather_now_kicker" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_weather_now_title" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_weather_now_intro" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_desk_kicker" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_desk_title" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_desk_intro" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_stories_kicker" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_stories_title" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_stories_intro" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_questions_kicker" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_questions_title" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_questions_intro" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_discover_kicker" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_discover_title" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_discover_intro" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_reports_kicker" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_reports_title" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_reports_intro" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_explore_today_kicker" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_explore_today_title" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_explore_today_intro" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_grenada_in_data_kicker" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_grenada_in_data_title" varchar;
  ALTER TABLE "homepage" ADD COLUMN "section_copy_grenada_in_data_intro" varchar;
  ALTER TABLE "homepage_rels" ADD COLUMN "stories_id" integer;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_weather_now_kicker" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_weather_now_title" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_weather_now_intro" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_desk_kicker" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_desk_title" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_desk_intro" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_stories_kicker" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_stories_title" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_stories_intro" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_questions_kicker" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_questions_title" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_questions_intro" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_discover_kicker" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_discover_title" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_discover_intro" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_reports_kicker" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_reports_title" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_reports_intro" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_explore_today_kicker" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_explore_today_title" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_explore_today_intro" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_grenada_in_data_kicker" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_grenada_in_data_title" varchar;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_section_copy_grenada_in_data_intro" varchar;
  ALTER TABLE "_homepage_v_rels" ADD COLUMN "stories_id" integer;
  ALTER TABLE "homepage_rels" ADD CONSTRAINT "homepage_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v_rels" ADD CONSTRAINT "_homepage_v_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "homepage_rels_stories_id_idx" ON "homepage_rels" USING btree ("stories_id");
  CREATE INDEX "_homepage_v_rels_stories_id_idx" ON "_homepage_v_rels" USING btree ("stories_id");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "homepage_rels" DROP CONSTRAINT "homepage_rels_stories_fk";
  
  ALTER TABLE "_homepage_v_rels" DROP CONSTRAINT "_homepage_v_rels_stories_fk";
  
  ALTER TABLE "homepage_hidden_sections" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_homepage_hidden_sections";
  CREATE TYPE "public"."enum_homepage_hidden_sections" AS ENUM('weather-now', 'desk', 'stories', 'questions', 'discover', 'reports');
  ALTER TABLE "homepage_hidden_sections" ALTER COLUMN "value" SET DATA TYPE "public"."enum_homepage_hidden_sections" USING "value"::"public"."enum_homepage_hidden_sections";
  ALTER TABLE "_homepage_v_version_hidden_sections" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum__homepage_v_version_hidden_sections";
  CREATE TYPE "public"."enum__homepage_v_version_hidden_sections" AS ENUM('weather-now', 'desk', 'stories', 'questions', 'discover', 'reports');
  ALTER TABLE "_homepage_v_version_hidden_sections" ALTER COLUMN "value" SET DATA TYPE "public"."enum__homepage_v_version_hidden_sections" USING "value"::"public"."enum__homepage_v_version_hidden_sections";
  DROP INDEX "homepage_rels_stories_id_idx";
  DROP INDEX "_homepage_v_rels_stories_id_idx";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_weather_now_kicker";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_weather_now_title";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_weather_now_intro";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_desk_kicker";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_desk_title";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_desk_intro";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_stories_kicker";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_stories_title";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_stories_intro";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_questions_kicker";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_questions_title";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_questions_intro";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_discover_kicker";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_discover_title";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_discover_intro";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_reports_kicker";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_reports_title";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_reports_intro";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_explore_today_kicker";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_explore_today_title";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_explore_today_intro";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_grenada_in_data_kicker";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_grenada_in_data_title";
  ALTER TABLE "homepage" DROP COLUMN "section_copy_grenada_in_data_intro";
  ALTER TABLE "homepage_rels" DROP COLUMN "stories_id";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_weather_now_kicker";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_weather_now_title";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_weather_now_intro";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_desk_kicker";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_desk_title";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_desk_intro";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_stories_kicker";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_stories_title";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_stories_intro";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_questions_kicker";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_questions_title";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_questions_intro";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_discover_kicker";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_discover_title";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_discover_intro";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_reports_kicker";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_reports_title";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_reports_intro";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_explore_today_kicker";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_explore_today_title";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_explore_today_intro";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_grenada_in_data_kicker";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_grenada_in_data_title";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_section_copy_grenada_in_data_intro";
  ALTER TABLE "_homepage_v_rels" DROP COLUMN "stories_id";`);
}
