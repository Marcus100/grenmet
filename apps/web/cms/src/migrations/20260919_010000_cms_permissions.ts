import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_content_update_type" AS ENUM('Product update', 'Service update', 'Announcement', 'Public notice', 'Community update');
  CREATE TYPE "public"."enum_content_news_type" AS ENUM('Local weather story', 'Weather event', 'Climate story', 'Weather explainer', 'Community impact');
  CREATE TYPE "public"."enum_content_publication_type" AS ENUM('Report', 'Guide', 'Bulletin', 'Policy', 'Research paper', 'Dataset', 'Other');
  ALTER TABLE "content" ADD COLUMN "kicker" varchar;
  ALTER TABLE "content" ADD COLUMN "hero_caption" varchar;
  ALTER TABLE "content" ADD COLUMN "update_type" "enum_content_update_type";
  ALTER TABLE "content" ADD COLUMN "news_type" "enum_content_news_type";
  ALTER TABLE "content" ADD COLUMN "official_document_id" integer;
  ALTER TABLE "content" ADD COLUMN "publication_type" "enum_content_publication_type";
  ALTER TABLE "content" ADD COLUMN "video_url" varchar;
  ALTER TABLE "content" ADD COLUMN "social_caption" varchar;
  ALTER TABLE "_content_v" ADD COLUMN "version_kicker" varchar;
  ALTER TABLE "_content_v" ADD COLUMN "version_hero_caption" varchar;
  ALTER TABLE "_content_v" ADD COLUMN "version_update_type" "enum_content_update_type";
  ALTER TABLE "_content_v" ADD COLUMN "version_news_type" "enum_content_news_type";
  ALTER TABLE "_content_v" ADD COLUMN "version_official_document_id" integer;
  ALTER TABLE "_content_v" ADD COLUMN "version_publication_type" "enum_content_publication_type";
  ALTER TABLE "_content_v" ADD COLUMN "version_video_url" varchar;
  ALTER TABLE "_content_v" ADD COLUMN "version_social_caption" varchar;
  ALTER TABLE "content" ADD COLUMN "social_enabled_platforms" jsonb;
  ALTER TABLE "content" ADD COLUMN "social_publish_at" timestamptz;
  ALTER TABLE "content" ADD COLUMN "social_x_text" varchar;
  ALTER TABLE "content" ADD COLUMN "social_facebook_text" varchar;
  ALTER TABLE "content" ADD COLUMN "social_instagram_text" varchar;
  ALTER TABLE "content" ADD COLUMN "social_linkedin_text" varchar;
  ALTER TABLE "content" ADD COLUMN "social_whatsapp_text" varchar;
  ALTER TABLE "content" ADD COLUMN "social_youtube_title" varchar;
  ALTER TABLE "content" ADD COLUMN "social_youtube_description" varchar;
  ALTER TABLE "_content_v" ADD COLUMN "version_social_enabled_platforms" jsonb;
  ALTER TABLE "_content_v" ADD COLUMN "version_social_publish_at" timestamptz;
  ALTER TABLE "_content_v" ADD COLUMN "version_social_x_text" varchar;
  ALTER TABLE "_content_v" ADD COLUMN "version_social_facebook_text" varchar;
  ALTER TABLE "_content_v" ADD COLUMN "version_social_instagram_text" varchar;
  ALTER TABLE "_content_v" ADD COLUMN "version_social_linkedin_text" varchar;
  ALTER TABLE "_content_v" ADD COLUMN "version_social_whatsapp_text" varchar;
  ALTER TABLE "_content_v" ADD COLUMN "version_social_youtube_title" varchar;
  ALTER TABLE "_content_v" ADD COLUMN "version_social_youtube_description" varchar;
  ALTER TABLE "users" ADD COLUMN "permission_keys" jsonb DEFAULT '[]'::jsonb NOT NULL;
  ALTER TABLE "content" DROP COLUMN "kind";
  ALTER TABLE "_content_v" DROP COLUMN "version_kind";
  DROP TYPE "public"."enum_content_kind";`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_content_kind" AS ENUM('article', 'page');
  ALTER TABLE "content" ADD COLUMN "kind" "enum_content_kind" DEFAULT 'article' NOT NULL;
  ALTER TABLE "_content_v" ADD COLUMN "version_kind" "enum_content_kind" DEFAULT 'article' NOT NULL;
  ALTER TABLE "users" DROP COLUMN "permission_keys";`);
}
