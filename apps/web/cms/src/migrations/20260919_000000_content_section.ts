import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_content_section" AS ENUM('latest-from-us', 'weather-news', 'latest-publications');
  CREATE TYPE "public"."enum__content_v_version_section" AS ENUM('latest-from-us', 'weather-news', 'latest-publications');
  ALTER TABLE "content" ADD COLUMN "section" "enum_content_section" DEFAULT 'latest-from-us';
  ALTER TABLE "_content_v" ADD COLUMN "version_section" "enum__content_v_version_section" DEFAULT 'latest-from-us';
  UPDATE "content" SET "section" = CASE "placement" WHEN 'latest' THEN 'latest-from-us' ELSE 'weather-news' END::"public"."enum_content_section";`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "content" DROP COLUMN "section";
  ALTER TABLE "_content_v" DROP COLUMN "version_section";
  DROP TYPE "public"."enum_content_section";
  DROP TYPE "public"."enum__content_v_version_section";`);
}
