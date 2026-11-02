import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "desk_updates" ADD COLUMN "pinned" boolean DEFAULT false;
  ALTER TABLE "desk_updates" ADD COLUMN "social_facebook_image_id" integer;
  ALTER TABLE "desk_updates" ADD COLUMN "social_instagram_image_id" integer;
  ALTER TABLE "desk_updates" ADD COLUMN "social_whatsapp_image_id" integer;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_pinned" boolean DEFAULT false;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_social_facebook_image_id" integer;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_social_instagram_image_id" integer;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_social_whatsapp_image_id" integer;
  ALTER TABLE "desk_updates" ADD CONSTRAINT "desk_updates_social_facebook_image_id_media_id_fk" FOREIGN KEY ("social_facebook_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "desk_updates" ADD CONSTRAINT "desk_updates_social_instagram_image_id_media_id_fk" FOREIGN KEY ("social_instagram_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "desk_updates" ADD CONSTRAINT "desk_updates_social_whatsapp_image_id_media_id_fk" FOREIGN KEY ("social_whatsapp_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_desk_updates_v" ADD CONSTRAINT "_desk_updates_v_version_social_facebook_image_id_media_id_fk" FOREIGN KEY ("version_social_facebook_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_desk_updates_v" ADD CONSTRAINT "_desk_updates_v_version_social_instagram_image_id_media_id_fk" FOREIGN KEY ("version_social_instagram_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_desk_updates_v" ADD CONSTRAINT "_desk_updates_v_version_social_whatsapp_image_id_media_id_fk" FOREIGN KEY ("version_social_whatsapp_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "desk_updates_social_social_facebook_image_idx" ON "desk_updates" USING btree ("social_facebook_image_id");
  CREATE INDEX "desk_updates_social_social_instagram_image_idx" ON "desk_updates" USING btree ("social_instagram_image_id");
  CREATE INDEX "desk_updates_social_social_whatsapp_image_idx" ON "desk_updates" USING btree ("social_whatsapp_image_id");
  CREATE INDEX "_desk_updates_v_version_social_version_social_facebook_i_idx" ON "_desk_updates_v" USING btree ("version_social_facebook_image_id");
  CREATE INDEX "_desk_updates_v_version_social_version_social_instagram__idx" ON "_desk_updates_v" USING btree ("version_social_instagram_image_id");
  CREATE INDEX "_desk_updates_v_version_social_version_social_whatsapp_i_idx" ON "_desk_updates_v" USING btree ("version_social_whatsapp_image_id");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "desk_updates" DROP CONSTRAINT "desk_updates_social_facebook_image_id_media_id_fk";
  ALTER TABLE "desk_updates" DROP CONSTRAINT "desk_updates_social_instagram_image_id_media_id_fk";
  ALTER TABLE "desk_updates" DROP CONSTRAINT "desk_updates_social_whatsapp_image_id_media_id_fk";
  ALTER TABLE "_desk_updates_v" DROP CONSTRAINT "_desk_updates_v_version_social_facebook_image_id_media_id_fk";
  ALTER TABLE "_desk_updates_v" DROP CONSTRAINT "_desk_updates_v_version_social_instagram_image_id_media_id_fk";
  ALTER TABLE "_desk_updates_v" DROP CONSTRAINT "_desk_updates_v_version_social_whatsapp_image_id_media_id_fk";
  DROP INDEX "desk_updates_social_social_facebook_image_idx";
  DROP INDEX "desk_updates_social_social_instagram_image_idx";
  DROP INDEX "desk_updates_social_social_whatsapp_image_idx";
  DROP INDEX "_desk_updates_v_version_social_version_social_facebook_i_idx";
  DROP INDEX "_desk_updates_v_version_social_version_social_instagram__idx";
  DROP INDEX "_desk_updates_v_version_social_version_social_whatsapp_i_idx";
  ALTER TABLE "desk_updates" DROP COLUMN "pinned";
  ALTER TABLE "desk_updates" DROP COLUMN "social_facebook_image_id";
  ALTER TABLE "desk_updates" DROP COLUMN "social_instagram_image_id";
  ALTER TABLE "desk_updates" DROP COLUMN "social_whatsapp_image_id";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_pinned";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_social_facebook_image_id";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_social_instagram_image_id";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_social_whatsapp_image_id";`);
}
