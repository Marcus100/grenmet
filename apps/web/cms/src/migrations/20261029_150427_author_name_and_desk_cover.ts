import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "live_posts" ADD COLUMN "author_name" varchar;
  ALTER TABLE "_live_posts_v" ADD COLUMN "version_author_name" varchar;
  ALTER TABLE "desk_updates" ADD COLUMN "image_id" integer;
  ALTER TABLE "desk_updates" ADD COLUMN "image_caption" varchar;
  ALTER TABLE "desk_updates" ADD COLUMN "author_name" varchar;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_image_id" integer;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_image_caption" varchar;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_author_name" varchar;
  ALTER TABLE "report_notes" ADD COLUMN "author_name" varchar;
  ALTER TABLE "_report_notes_v" ADD COLUMN "version_author_name" varchar;
  ALTER TABLE "stories" ADD COLUMN "author_name" varchar;
  ALTER TABLE "_stories_v" ADD COLUMN "version_author_name" varchar;
  ALTER TABLE "questions" ADD COLUMN "author_name" varchar;
  ALTER TABLE "_questions_v" ADD COLUMN "version_author_name" varchar;
  ALTER TABLE "discover" ADD COLUMN "author_name" varchar;
  ALTER TABLE "_discover_v" ADD COLUMN "version_author_name" varchar;
  ALTER TABLE "desk_updates" ADD CONSTRAINT "desk_updates_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_desk_updates_v" ADD CONSTRAINT "_desk_updates_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "desk_updates_image_idx" ON "desk_updates" USING btree ("image_id");
  CREATE INDEX "_desk_updates_v_version_version_image_idx" ON "_desk_updates_v" USING btree ("version_image_id");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "desk_updates" DROP CONSTRAINT "desk_updates_image_id_media_id_fk";
  
  ALTER TABLE "_desk_updates_v" DROP CONSTRAINT "_desk_updates_v_version_image_id_media_id_fk";
  
  DROP INDEX "desk_updates_image_idx";
  DROP INDEX "_desk_updates_v_version_version_image_idx";
  ALTER TABLE "live_posts" DROP COLUMN "author_name";
  ALTER TABLE "_live_posts_v" DROP COLUMN "version_author_name";
  ALTER TABLE "desk_updates" DROP COLUMN "image_id";
  ALTER TABLE "desk_updates" DROP COLUMN "image_caption";
  ALTER TABLE "desk_updates" DROP COLUMN "author_name";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_image_id";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_image_caption";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_author_name";
  ALTER TABLE "report_notes" DROP COLUMN "author_name";
  ALTER TABLE "_report_notes_v" DROP COLUMN "version_author_name";
  ALTER TABLE "stories" DROP COLUMN "author_name";
  ALTER TABLE "_stories_v" DROP COLUMN "version_author_name";
  ALTER TABLE "questions" DROP COLUMN "author_name";
  ALTER TABLE "_questions_v" DROP COLUMN "version_author_name";
  ALTER TABLE "discover" DROP COLUMN "author_name";
  ALTER TABLE "_discover_v" DROP COLUMN "version_author_name";`);
}
