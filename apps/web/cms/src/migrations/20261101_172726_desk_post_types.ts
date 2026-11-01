import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_desk_updates_format" AS ENUM('standard', 'audio', 'video', 'chart');
  CREATE TYPE "public"."enum__desk_updates_v_version_format" AS ENUM('standard', 'audio', 'video', 'chart');
  ALTER TABLE "desk_updates" ADD COLUMN "format" "enum_desk_updates_format" DEFAULT 'standard' NOT NULL;
  ALTER TABLE "desk_updates" ADD COLUMN "media_url" varchar;
  ALTER TABLE "desk_updates" ADD COLUMN "author_role" varchar;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_format" "enum__desk_updates_v_version_format" DEFAULT 'standard' NOT NULL;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_media_url" varchar;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_author_role" varchar;`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "desk_updates" DROP COLUMN "format";
  ALTER TABLE "desk_updates" DROP COLUMN "media_url";
  ALTER TABLE "desk_updates" DROP COLUMN "author_role";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_format";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_media_url";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_author_role";
  DROP TYPE "public"."enum_desk_updates_format";
  DROP TYPE "public"."enum__desk_updates_v_version_format";`);
}
