import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "desk_updates" ADD COLUMN "social_image_id" integer;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_social_image_id" integer;
  ALTER TABLE "report_notes" ADD COLUMN "social_image_id" integer;
  ALTER TABLE "_report_notes_v" ADD COLUMN "version_social_image_id" integer;
  ALTER TABLE "stories" ADD COLUMN "social_image_id" integer;
  ALTER TABLE "_stories_v" ADD COLUMN "version_social_image_id" integer;
  ALTER TABLE "desk_updates" ADD CONSTRAINT "desk_updates_social_image_id_media_id_fk" FOREIGN KEY ("social_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_desk_updates_v" ADD CONSTRAINT "_desk_updates_v_version_social_image_id_media_id_fk" FOREIGN KEY ("version_social_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "report_notes" ADD CONSTRAINT "report_notes_social_image_id_media_id_fk" FOREIGN KEY ("social_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_report_notes_v" ADD CONSTRAINT "_report_notes_v_version_social_image_id_media_id_fk" FOREIGN KEY ("version_social_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stories" ADD CONSTRAINT "stories_social_image_id_media_id_fk" FOREIGN KEY ("social_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stories_v" ADD CONSTRAINT "_stories_v_version_social_image_id_media_id_fk" FOREIGN KEY ("version_social_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "desk_updates_social_social_image_idx" ON "desk_updates" USING btree ("social_image_id");
  CREATE INDEX "_desk_updates_v_version_social_version_social_image_idx" ON "_desk_updates_v" USING btree ("version_social_image_id");
  CREATE INDEX "report_notes_social_social_image_idx" ON "report_notes" USING btree ("social_image_id");
  CREATE INDEX "_report_notes_v_version_social_version_social_image_idx" ON "_report_notes_v" USING btree ("version_social_image_id");
  CREATE INDEX "stories_social_social_image_idx" ON "stories" USING btree ("social_image_id");
  CREATE INDEX "_stories_v_version_social_version_social_image_idx" ON "_stories_v" USING btree ("version_social_image_id");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "desk_updates" DROP CONSTRAINT "desk_updates_social_image_id_media_id_fk";
  
  ALTER TABLE "_desk_updates_v" DROP CONSTRAINT "_desk_updates_v_version_social_image_id_media_id_fk";
  
  ALTER TABLE "report_notes" DROP CONSTRAINT "report_notes_social_image_id_media_id_fk";
  
  ALTER TABLE "_report_notes_v" DROP CONSTRAINT "_report_notes_v_version_social_image_id_media_id_fk";
  
  ALTER TABLE "stories" DROP CONSTRAINT "stories_social_image_id_media_id_fk";
  
  ALTER TABLE "_stories_v" DROP CONSTRAINT "_stories_v_version_social_image_id_media_id_fk";
  
  DROP INDEX "desk_updates_social_social_image_idx";
  DROP INDEX "_desk_updates_v_version_social_version_social_image_idx";
  DROP INDEX "report_notes_social_social_image_idx";
  DROP INDEX "_report_notes_v_version_social_version_social_image_idx";
  DROP INDEX "stories_social_social_image_idx";
  DROP INDEX "_stories_v_version_social_version_social_image_idx";
  ALTER TABLE "desk_updates" DROP COLUMN "social_image_id";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_social_image_id";
  ALTER TABLE "report_notes" DROP COLUMN "social_image_id";
  ALTER TABLE "_report_notes_v" DROP COLUMN "version_social_image_id";
  ALTER TABLE "stories" DROP COLUMN "social_image_id";
  ALTER TABLE "_stories_v" DROP COLUMN "version_social_image_id";`);
}
