import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_content_placement" AS ENUM('latest', 'news', 'both');
  CREATE TYPE "public"."enum__content_v_version_placement" AS ENUM('latest', 'news', 'both');
  ALTER TABLE "content" ADD COLUMN "placement" "enum_content_placement" DEFAULT 'news';
  ALTER TABLE "_content_v" ADD COLUMN "version_placement" "enum__content_v_version_placement" DEFAULT 'news';`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "content" DROP COLUMN "placement";
  ALTER TABLE "_content_v" DROP COLUMN "version_placement";
  DROP TYPE "public"."enum_content_placement";
  DROP TYPE "public"."enum__content_v_version_placement";`);
}
