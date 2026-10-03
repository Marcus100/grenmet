import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

/**
 * Bounded editorial collections (desk updates, stories, publications) built
 * from shared fields, replacing the single "content" collection. Generated
 * from the Payload schema; the content drops are hand-written.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  -- Old posts are cleared by decision (29 Sep 2026); the single "content"
  -- collection is replaced by bounded collections. Written with IF EXISTS
  -- because older hand-written migrations stored some fields differently.
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payload_locked_documents_rels' AND column_name = 'content_id') THEN
      DELETE FROM "payload_locked_documents_rels" WHERE "content_id" IS NOT NULL;
    END IF;
  END $$;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_content_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_content_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "content_id";
  DELETE FROM "payload_locked_documents" WHERE "global_slug" IS NULL AND NOT EXISTS (SELECT 1 FROM "payload_locked_documents_rels" r WHERE r."parent_id" = "payload_locked_documents"."id");
  DROP TABLE IF EXISTS "_content_v_version_related_links" CASCADE;
  DROP TABLE IF EXISTS "_content_v_version_social_enabled_platforms" CASCADE;
  DROP TABLE IF EXISTS "_content_v" CASCADE;
  DROP TABLE IF EXISTS "content_related_links" CASCADE;
  DROP TABLE IF EXISTS "content_social_enabled_platforms" CASCADE;
  DROP TABLE IF EXISTS "content" CASCADE;
  DROP TYPE IF EXISTS "public"."enum__content_v_version_kind";
  DROP TYPE IF EXISTS "public"."enum__content_v_version_placement";
  DROP TYPE IF EXISTS "public"."enum__content_v_version_related_links_category";
  DROP TYPE IF EXISTS "public"."enum__content_v_version_section";
  DROP TYPE IF EXISTS "public"."enum__content_v_version_status";
  DROP TYPE IF EXISTS "public"."enum__content_v_version_social_enabled_platforms";
  DROP TYPE IF EXISTS "public"."enum__content_v_version_update_type";
  DROP TYPE IF EXISTS "public"."enum__content_v_version_news_type";
  DROP TYPE IF EXISTS "public"."enum__content_v_version_publication_type";
  DROP TYPE IF EXISTS "public"."enum_content_kind";
  DROP TYPE IF EXISTS "public"."enum_content_news_type";
  DROP TYPE IF EXISTS "public"."enum_content_placement";
  DROP TYPE IF EXISTS "public"."enum_content_publication_type";
  DROP TYPE IF EXISTS "public"."enum_content_related_links_category";
  DROP TYPE IF EXISTS "public"."enum_content_section";
  DROP TYPE IF EXISTS "public"."enum_content_social_enabled_platforms";
  DROP TYPE IF EXISTS "public"."enum_content_status";
  DROP TYPE IF EXISTS "public"."enum_content_update_type";
  CREATE TYPE "public"."enum_desk_updates_social_enabled_platforms" AS ENUM('X', 'Facebook', 'Instagram', 'YouTube', 'LinkedIn', 'WhatsApp Channel');
  CREATE TYPE "public"."enum_desk_updates_related_links_category" AS ENUM('forecast', 'cap', 'aviation', 'bulletin', 'publication', 'article', 'source');
  CREATE TYPE "public"."enum_desk_updates_kind" AS ENUM('product-update', 'service-update', 'announcement', 'public-notice', 'community-update');
  CREATE TYPE "public"."enum_desk_updates_product" AS ENUM('tropical-outlook', 'bulletins', 'forecasts', 'marine', 'aviation', 'cap');
  CREATE TYPE "public"."enum_desk_updates_status" AS ENUM('draft', 'review', 'published');
  CREATE TYPE "public"."enum__desk_updates_v_version_social_enabled_platforms" AS ENUM('X', 'Facebook', 'Instagram', 'YouTube', 'LinkedIn', 'WhatsApp Channel');
  CREATE TYPE "public"."enum__desk_updates_v_version_related_links_category" AS ENUM('forecast', 'cap', 'aviation', 'bulletin', 'publication', 'article', 'source');
  CREATE TYPE "public"."enum__desk_updates_v_version_kind" AS ENUM('product-update', 'service-update', 'announcement', 'public-notice', 'community-update');
  CREATE TYPE "public"."enum__desk_updates_v_version_product" AS ENUM('tropical-outlook', 'bulletins', 'forecasts', 'marine', 'aviation', 'cap');
  CREATE TYPE "public"."enum__desk_updates_v_version_status" AS ENUM('draft', 'review', 'published');
  CREATE TYPE "public"."enum_stories_topics" AS ENUM('tropical', 'rain', 'heat', 'marine', 'climate', 'sky', 'safety', 'agriculture', 'aviation', 'gms');
  CREATE TYPE "public"."enum_stories_social_enabled_platforms" AS ENUM('X', 'Facebook', 'Instagram', 'YouTube', 'LinkedIn', 'WhatsApp Channel');
  CREATE TYPE "public"."enum_stories_related_links_category" AS ENUM('forecast', 'cap', 'aviation', 'bulletin', 'publication', 'article', 'source');
  CREATE TYPE "public"."enum_stories_kind" AS ENUM('local-story', 'weather-event', 'climate', 'ocean', 'explainer', 'community');
  CREATE TYPE "public"."enum_stories_status" AS ENUM('draft', 'review', 'published');
  CREATE TYPE "public"."enum__stories_v_version_topics" AS ENUM('tropical', 'rain', 'heat', 'marine', 'climate', 'sky', 'safety', 'agriculture', 'aviation', 'gms');
  CREATE TYPE "public"."enum__stories_v_version_social_enabled_platforms" AS ENUM('X', 'Facebook', 'Instagram', 'YouTube', 'LinkedIn', 'WhatsApp Channel');
  CREATE TYPE "public"."enum__stories_v_version_related_links_category" AS ENUM('forecast', 'cap', 'aviation', 'bulletin', 'publication', 'article', 'source');
  CREATE TYPE "public"."enum__stories_v_version_kind" AS ENUM('local-story', 'weather-event', 'climate', 'ocean', 'explainer', 'community');
  CREATE TYPE "public"."enum__stories_v_version_status" AS ENUM('draft', 'review', 'published');
  CREATE TYPE "public"."enum_publications_topics" AS ENUM('tropical', 'rain', 'heat', 'marine', 'climate', 'sky', 'safety', 'agriculture', 'aviation', 'gms');
  CREATE TYPE "public"."enum_publications_social_enabled_platforms" AS ENUM('X', 'Facebook', 'Instagram', 'YouTube', 'LinkedIn', 'WhatsApp Channel');
  CREATE TYPE "public"."enum_publications_related_links_category" AS ENUM('forecast', 'cap', 'aviation', 'bulletin', 'publication', 'article', 'source');
  CREATE TYPE "public"."enum_publications_type" AS ENUM('report', 'climate-bulletin', 'outlook', 'guide', 'dataset', 'policy', 'research');
  CREATE TYPE "public"."enum_publications_series" AS ENUM('monthly-climate', 'seasonal-outlook', 'hurricane-season', 'annual-report');
  CREATE TYPE "public"."enum_publications_status" AS ENUM('draft', 'review', 'published');
  CREATE TYPE "public"."enum__publications_v_version_topics" AS ENUM('tropical', 'rain', 'heat', 'marine', 'climate', 'sky', 'safety', 'agriculture', 'aviation', 'gms');
  CREATE TYPE "public"."enum__publications_v_version_social_enabled_platforms" AS ENUM('X', 'Facebook', 'Instagram', 'YouTube', 'LinkedIn', 'WhatsApp Channel');
  CREATE TYPE "public"."enum__publications_v_version_related_links_category" AS ENUM('forecast', 'cap', 'aviation', 'bulletin', 'publication', 'article', 'source');
  CREATE TYPE "public"."enum__publications_v_version_type" AS ENUM('report', 'climate-bulletin', 'outlook', 'guide', 'dataset', 'policy', 'research');
  CREATE TYPE "public"."enum__publications_v_version_series" AS ENUM('monthly-climate', 'seasonal-outlook', 'hurricane-season', 'annual-report');
  CREATE TYPE "public"."enum__publications_v_version_status" AS ENUM('draft', 'review', 'published');
  CREATE TABLE "desk_updates_social_enabled_platforms" (
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"value" "enum_desk_updates_social_enabled_platforms",
	"id" serial PRIMARY KEY NOT NULL
);

  CREATE TABLE "desk_updates_related_links" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"category" "enum_desk_updates_related_links_category" NOT NULL,
	"url" varchar NOT NULL
);

  CREATE TABLE "desk_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"kind" "enum_desk_updates_kind" DEFAULT 'announcement' NOT NULL,
	"product" "enum_desk_updates_product",
	"summary" varchar NOT NULL,
	"body" jsonb,
	"social_caption" varchar,
	"social_publish_at" timestamp(3) with time zone,
	"social_x_text" varchar,
	"social_facebook_text" varchar,
	"social_instagram_text" varchar,
	"social_linkedin_text" varchar,
	"social_whatsapp_text" varchar,
	"slug" varchar NOT NULL,
	"status" "enum_desk_updates_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp(3) with time zone,
	"author_id" integer NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

  CREATE TABLE "_desk_updates_v_version_social_enabled_platforms" (
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"value" "enum__desk_updates_v_version_social_enabled_platforms",
	"id" serial PRIMARY KEY NOT NULL
);

  CREATE TABLE "_desk_updates_v_version_related_links" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"category" "enum__desk_updates_v_version_related_links_category" NOT NULL,
	"url" varchar NOT NULL,
	"_uuid" varchar
);

  CREATE TABLE "_desk_updates_v" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"version_title" varchar NOT NULL,
	"version_kind" "enum__desk_updates_v_version_kind" DEFAULT 'announcement' NOT NULL,
	"version_product" "enum__desk_updates_v_version_product",
	"version_summary" varchar NOT NULL,
	"version_body" jsonb,
	"version_social_caption" varchar,
	"version_social_publish_at" timestamp(3) with time zone,
	"version_social_x_text" varchar,
	"version_social_facebook_text" varchar,
	"version_social_instagram_text" varchar,
	"version_social_linkedin_text" varchar,
	"version_social_whatsapp_text" varchar,
	"version_slug" varchar NOT NULL,
	"version_status" "enum__desk_updates_v_version_status" DEFAULT 'draft' NOT NULL,
	"version_published_at" timestamp(3) with time zone,
	"version_author_id" integer NOT NULL,
	"version_updated_at" timestamp(3) with time zone,
	"version_created_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

  CREATE TABLE "stories_topics" (
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"value" "enum_stories_topics",
	"id" serial PRIMARY KEY NOT NULL
);

  CREATE TABLE "stories_social_enabled_platforms" (
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"value" "enum_stories_social_enabled_platforms",
	"id" serial PRIMARY KEY NOT NULL
);

  CREATE TABLE "stories_related_links" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"category" "enum_stories_related_links_category" NOT NULL,
	"url" varchar NOT NULL
);

  CREATE TABLE "stories" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"kicker" varchar,
	"kind" "enum_stories_kind" DEFAULT 'local-story' NOT NULL,
	"summary" varchar NOT NULL,
	"image_id" integer NOT NULL,
	"image_caption" varchar,
	"body" jsonb NOT NULL,
	"seo_title" varchar,
	"seo_description" varchar,
	"seo_image_id" integer,
	"social_caption" varchar,
	"social_publish_at" timestamp(3) with time zone,
	"social_x_text" varchar,
	"social_facebook_text" varchar,
	"social_instagram_text" varchar,
	"social_linkedin_text" varchar,
	"social_whatsapp_text" varchar,
	"slug" varchar NOT NULL,
	"status" "enum_stories_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp(3) with time zone,
	"author_id" integer NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

  CREATE TABLE "_stories_v_version_topics" (
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"value" "enum__stories_v_version_topics",
	"id" serial PRIMARY KEY NOT NULL
);

  CREATE TABLE "_stories_v_version_social_enabled_platforms" (
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"value" "enum__stories_v_version_social_enabled_platforms",
	"id" serial PRIMARY KEY NOT NULL
);

  CREATE TABLE "_stories_v_version_related_links" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"category" "enum__stories_v_version_related_links_category" NOT NULL,
	"url" varchar NOT NULL,
	"_uuid" varchar
);

  CREATE TABLE "_stories_v" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"version_title" varchar NOT NULL,
	"version_kicker" varchar,
	"version_kind" "enum__stories_v_version_kind" DEFAULT 'local-story' NOT NULL,
	"version_summary" varchar NOT NULL,
	"version_image_id" integer NOT NULL,
	"version_image_caption" varchar,
	"version_body" jsonb NOT NULL,
	"version_seo_title" varchar,
	"version_seo_description" varchar,
	"version_seo_image_id" integer,
	"version_social_caption" varchar,
	"version_social_publish_at" timestamp(3) with time zone,
	"version_social_x_text" varchar,
	"version_social_facebook_text" varchar,
	"version_social_instagram_text" varchar,
	"version_social_linkedin_text" varchar,
	"version_social_whatsapp_text" varchar,
	"version_slug" varchar NOT NULL,
	"version_status" "enum__stories_v_version_status" DEFAULT 'draft' NOT NULL,
	"version_published_at" timestamp(3) with time zone,
	"version_author_id" integer NOT NULL,
	"version_updated_at" timestamp(3) with time zone,
	"version_created_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

  CREATE TABLE "publications_key_findings" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"text" varchar NOT NULL
);

  CREATE TABLE "publications_topics" (
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"value" "enum_publications_topics",
	"id" serial PRIMARY KEY NOT NULL
);

  CREATE TABLE "publications_social_enabled_platforms" (
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"value" "enum_publications_social_enabled_platforms",
	"id" serial PRIMARY KEY NOT NULL
);

  CREATE TABLE "publications_related_links" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"category" "enum_publications_related_links_category" NOT NULL,
	"url" varchar NOT NULL
);

  CREATE TABLE "publications" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"type" "enum_publications_type" DEFAULT 'report' NOT NULL,
	"series" "enum_publications_series",
	"document_id" integer NOT NULL,
	"period_start" timestamp(3) with time zone,
	"period_end" timestamp(3) with time zone,
	"summary" varchar NOT NULL,
	"image_id" integer,
	"image_caption" varchar,
	"body" jsonb,
	"seo_title" varchar,
	"seo_description" varchar,
	"seo_image_id" integer,
	"social_caption" varchar,
	"social_publish_at" timestamp(3) with time zone,
	"social_x_text" varchar,
	"social_facebook_text" varchar,
	"social_instagram_text" varchar,
	"social_linkedin_text" varchar,
	"social_whatsapp_text" varchar,
	"slug" varchar NOT NULL,
	"status" "enum_publications_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp(3) with time zone,
	"author_id" integer NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

  CREATE TABLE "_publications_v_version_key_findings" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"text" varchar NOT NULL,
	"_uuid" varchar
);

  CREATE TABLE "_publications_v_version_topics" (
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"value" "enum__publications_v_version_topics",
	"id" serial PRIMARY KEY NOT NULL
);

  CREATE TABLE "_publications_v_version_social_enabled_platforms" (
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"value" "enum__publications_v_version_social_enabled_platforms",
	"id" serial PRIMARY KEY NOT NULL
);

  CREATE TABLE "_publications_v_version_related_links" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"category" "enum__publications_v_version_related_links_category" NOT NULL,
	"url" varchar NOT NULL,
	"_uuid" varchar
);

  CREATE TABLE "_publications_v" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"version_title" varchar NOT NULL,
	"version_type" "enum__publications_v_version_type" DEFAULT 'report' NOT NULL,
	"version_series" "enum__publications_v_version_series",
	"version_document_id" integer NOT NULL,
	"version_period_start" timestamp(3) with time zone,
	"version_period_end" timestamp(3) with time zone,
	"version_summary" varchar NOT NULL,
	"version_image_id" integer,
	"version_image_caption" varchar,
	"version_body" jsonb,
	"version_seo_title" varchar,
	"version_seo_description" varchar,
	"version_seo_image_id" integer,
	"version_social_caption" varchar,
	"version_social_publish_at" timestamp(3) with time zone,
	"version_social_x_text" varchar,
	"version_social_facebook_text" varchar,
	"version_social_instagram_text" varchar,
	"version_social_linkedin_text" varchar,
	"version_social_whatsapp_text" varchar,
	"version_slug" varchar NOT NULL,
	"version_status" "enum__publications_v_version_status" DEFAULT 'draft' NOT NULL,
	"version_published_at" timestamp(3) with time zone,
	"version_author_id" integer NOT NULL,
	"version_updated_at" timestamp(3) with time zone,
	"version_created_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "desk_updates_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "stories_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "publications_id" integer;
  ALTER TABLE "desk_updates_social_enabled_platforms" ADD CONSTRAINT "desk_updates_social_enabled_platforms_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."desk_updates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "desk_updates_related_links" ADD CONSTRAINT "desk_updates_related_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."desk_updates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "desk_updates" ADD CONSTRAINT "desk_updates_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_desk_updates_v_version_social_enabled_platforms" ADD CONSTRAINT "_desk_updates_v_version_social_enabled_platforms_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_desk_updates_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_desk_updates_v_version_related_links" ADD CONSTRAINT "_desk_updates_v_version_related_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_desk_updates_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_desk_updates_v" ADD CONSTRAINT "_desk_updates_v_parent_id_desk_updates_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."desk_updates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_desk_updates_v" ADD CONSTRAINT "_desk_updates_v_version_author_id_users_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stories_topics" ADD CONSTRAINT "stories_topics_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stories_social_enabled_platforms" ADD CONSTRAINT "stories_social_enabled_platforms_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stories_related_links" ADD CONSTRAINT "stories_related_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stories" ADD CONSTRAINT "stories_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stories" ADD CONSTRAINT "stories_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stories" ADD CONSTRAINT "stories_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stories_v_version_topics" ADD CONSTRAINT "_stories_v_version_topics_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_stories_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stories_v_version_social_enabled_platforms" ADD CONSTRAINT "_stories_v_version_social_enabled_platforms_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_stories_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stories_v_version_related_links" ADD CONSTRAINT "_stories_v_version_related_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stories_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stories_v" ADD CONSTRAINT "_stories_v_parent_id_stories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stories_v" ADD CONSTRAINT "_stories_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stories_v" ADD CONSTRAINT "_stories_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stories_v" ADD CONSTRAINT "_stories_v_version_author_id_users_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publications_key_findings" ADD CONSTRAINT "publications_key_findings_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "publications_topics" ADD CONSTRAINT "publications_topics_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "publications_social_enabled_platforms" ADD CONSTRAINT "publications_social_enabled_platforms_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "publications_related_links" ADD CONSTRAINT "publications_related_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "publications" ADD CONSTRAINT "publications_document_id_media_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publications" ADD CONSTRAINT "publications_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publications" ADD CONSTRAINT "publications_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publications" ADD CONSTRAINT "publications_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_publications_v_version_key_findings" ADD CONSTRAINT "_publications_v_version_key_findings_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_publications_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_publications_v_version_topics" ADD CONSTRAINT "_publications_v_version_topics_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_publications_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_publications_v_version_social_enabled_platforms" ADD CONSTRAINT "_publications_v_version_social_enabled_platforms_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_publications_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_publications_v_version_related_links" ADD CONSTRAINT "_publications_v_version_related_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_publications_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_publications_v" ADD CONSTRAINT "_publications_v_parent_id_publications_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_publications_v" ADD CONSTRAINT "_publications_v_version_document_id_media_id_fk" FOREIGN KEY ("version_document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_publications_v" ADD CONSTRAINT "_publications_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_publications_v" ADD CONSTRAINT "_publications_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_publications_v" ADD CONSTRAINT "_publications_v_version_author_id_users_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "desk_updates_social_enabled_platforms_order_idx" ON "desk_updates_social_enabled_platforms" USING btree ("order");
  CREATE INDEX "desk_updates_social_enabled_platforms_parent_idx" ON "desk_updates_social_enabled_platforms" USING btree ("parent_id");
  CREATE INDEX "desk_updates_related_links_order_idx" ON "desk_updates_related_links" USING btree ("_order");
  CREATE INDEX "desk_updates_related_links_parent_id_idx" ON "desk_updates_related_links" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "desk_updates_slug_idx" ON "desk_updates" USING btree ("slug");
  CREATE INDEX "desk_updates_status_idx" ON "desk_updates" USING btree ("status");
  CREATE INDEX "desk_updates_published_at_idx" ON "desk_updates" USING btree ("published_at");
  CREATE INDEX "desk_updates_author_idx" ON "desk_updates" USING btree ("author_id");
  CREATE INDEX "desk_updates_updated_at_idx" ON "desk_updates" USING btree ("updated_at");
  CREATE INDEX "desk_updates_created_at_idx" ON "desk_updates" USING btree ("created_at");
  CREATE INDEX "_desk_updates_v_version_social_enabled_platforms_order_idx" ON "_desk_updates_v_version_social_enabled_platforms" USING btree ("order");
  CREATE INDEX "_desk_updates_v_version_social_enabled_platforms_parent_idx" ON "_desk_updates_v_version_social_enabled_platforms" USING btree ("parent_id");
  CREATE INDEX "_desk_updates_v_version_related_links_order_idx" ON "_desk_updates_v_version_related_links" USING btree ("_order");
  CREATE INDEX "_desk_updates_v_version_related_links_parent_id_idx" ON "_desk_updates_v_version_related_links" USING btree ("_parent_id");
  CREATE INDEX "_desk_updates_v_parent_idx" ON "_desk_updates_v" USING btree ("parent_id");
  CREATE INDEX "_desk_updates_v_version_version_slug_idx" ON "_desk_updates_v" USING btree ("version_slug");
  CREATE INDEX "_desk_updates_v_version_version_status_idx" ON "_desk_updates_v" USING btree ("version_status");
  CREATE INDEX "_desk_updates_v_version_version_published_at_idx" ON "_desk_updates_v" USING btree ("version_published_at");
  CREATE INDEX "_desk_updates_v_version_version_author_idx" ON "_desk_updates_v" USING btree ("version_author_id");
  CREATE INDEX "_desk_updates_v_version_version_updated_at_idx" ON "_desk_updates_v" USING btree ("version_updated_at");
  CREATE INDEX "_desk_updates_v_version_version_created_at_idx" ON "_desk_updates_v" USING btree ("version_created_at");
  CREATE INDEX "_desk_updates_v_created_at_idx" ON "_desk_updates_v" USING btree ("created_at");
  CREATE INDEX "_desk_updates_v_updated_at_idx" ON "_desk_updates_v" USING btree ("updated_at");
  CREATE INDEX "stories_topics_order_idx" ON "stories_topics" USING btree ("order");
  CREATE INDEX "stories_topics_parent_idx" ON "stories_topics" USING btree ("parent_id");
  CREATE INDEX "stories_social_enabled_platforms_order_idx" ON "stories_social_enabled_platforms" USING btree ("order");
  CREATE INDEX "stories_social_enabled_platforms_parent_idx" ON "stories_social_enabled_platforms" USING btree ("parent_id");
  CREATE INDEX "stories_related_links_order_idx" ON "stories_related_links" USING btree ("_order");
  CREATE INDEX "stories_related_links_parent_id_idx" ON "stories_related_links" USING btree ("_parent_id");
  CREATE INDEX "stories_image_idx" ON "stories" USING btree ("image_id");
  CREATE INDEX "stories_seo_seo_image_idx" ON "stories" USING btree ("seo_image_id");
  CREATE UNIQUE INDEX "stories_slug_idx" ON "stories" USING btree ("slug");
  CREATE INDEX "stories_status_idx" ON "stories" USING btree ("status");
  CREATE INDEX "stories_published_at_idx" ON "stories" USING btree ("published_at");
  CREATE INDEX "stories_author_idx" ON "stories" USING btree ("author_id");
  CREATE INDEX "stories_updated_at_idx" ON "stories" USING btree ("updated_at");
  CREATE INDEX "stories_created_at_idx" ON "stories" USING btree ("created_at");
  CREATE INDEX "_stories_v_version_topics_order_idx" ON "_stories_v_version_topics" USING btree ("order");
  CREATE INDEX "_stories_v_version_topics_parent_idx" ON "_stories_v_version_topics" USING btree ("parent_id");
  CREATE INDEX "_stories_v_version_social_enabled_platforms_order_idx" ON "_stories_v_version_social_enabled_platforms" USING btree ("order");
  CREATE INDEX "_stories_v_version_social_enabled_platforms_parent_idx" ON "_stories_v_version_social_enabled_platforms" USING btree ("parent_id");
  CREATE INDEX "_stories_v_version_related_links_order_idx" ON "_stories_v_version_related_links" USING btree ("_order");
  CREATE INDEX "_stories_v_version_related_links_parent_id_idx" ON "_stories_v_version_related_links" USING btree ("_parent_id");
  CREATE INDEX "_stories_v_parent_idx" ON "_stories_v" USING btree ("parent_id");
  CREATE INDEX "_stories_v_version_version_image_idx" ON "_stories_v" USING btree ("version_image_id");
  CREATE INDEX "_stories_v_version_seo_version_seo_image_idx" ON "_stories_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_stories_v_version_version_slug_idx" ON "_stories_v" USING btree ("version_slug");
  CREATE INDEX "_stories_v_version_version_status_idx" ON "_stories_v" USING btree ("version_status");
  CREATE INDEX "_stories_v_version_version_published_at_idx" ON "_stories_v" USING btree ("version_published_at");
  CREATE INDEX "_stories_v_version_version_author_idx" ON "_stories_v" USING btree ("version_author_id");
  CREATE INDEX "_stories_v_version_version_updated_at_idx" ON "_stories_v" USING btree ("version_updated_at");
  CREATE INDEX "_stories_v_version_version_created_at_idx" ON "_stories_v" USING btree ("version_created_at");
  CREATE INDEX "_stories_v_created_at_idx" ON "_stories_v" USING btree ("created_at");
  CREATE INDEX "_stories_v_updated_at_idx" ON "_stories_v" USING btree ("updated_at");
  CREATE INDEX "publications_key_findings_order_idx" ON "publications_key_findings" USING btree ("_order");
  CREATE INDEX "publications_key_findings_parent_id_idx" ON "publications_key_findings" USING btree ("_parent_id");
  CREATE INDEX "publications_topics_order_idx" ON "publications_topics" USING btree ("order");
  CREATE INDEX "publications_topics_parent_idx" ON "publications_topics" USING btree ("parent_id");
  CREATE INDEX "publications_social_enabled_platforms_order_idx" ON "publications_social_enabled_platforms" USING btree ("order");
  CREATE INDEX "publications_social_enabled_platforms_parent_idx" ON "publications_social_enabled_platforms" USING btree ("parent_id");
  CREATE INDEX "publications_related_links_order_idx" ON "publications_related_links" USING btree ("_order");
  CREATE INDEX "publications_related_links_parent_id_idx" ON "publications_related_links" USING btree ("_parent_id");
  CREATE INDEX "publications_document_idx" ON "publications" USING btree ("document_id");
  CREATE INDEX "publications_image_idx" ON "publications" USING btree ("image_id");
  CREATE INDEX "publications_seo_seo_image_idx" ON "publications" USING btree ("seo_image_id");
  CREATE UNIQUE INDEX "publications_slug_idx" ON "publications" USING btree ("slug");
  CREATE INDEX "publications_status_idx" ON "publications" USING btree ("status");
  CREATE INDEX "publications_published_at_idx" ON "publications" USING btree ("published_at");
  CREATE INDEX "publications_author_idx" ON "publications" USING btree ("author_id");
  CREATE INDEX "publications_updated_at_idx" ON "publications" USING btree ("updated_at");
  CREATE INDEX "publications_created_at_idx" ON "publications" USING btree ("created_at");
  CREATE INDEX "_publications_v_version_key_findings_order_idx" ON "_publications_v_version_key_findings" USING btree ("_order");
  CREATE INDEX "_publications_v_version_key_findings_parent_id_idx" ON "_publications_v_version_key_findings" USING btree ("_parent_id");
  CREATE INDEX "_publications_v_version_topics_order_idx" ON "_publications_v_version_topics" USING btree ("order");
  CREATE INDEX "_publications_v_version_topics_parent_idx" ON "_publications_v_version_topics" USING btree ("parent_id");
  CREATE INDEX "_publications_v_version_social_enabled_platforms_order_idx" ON "_publications_v_version_social_enabled_platforms" USING btree ("order");
  CREATE INDEX "_publications_v_version_social_enabled_platforms_parent_idx" ON "_publications_v_version_social_enabled_platforms" USING btree ("parent_id");
  CREATE INDEX "_publications_v_version_related_links_order_idx" ON "_publications_v_version_related_links" USING btree ("_order");
  CREATE INDEX "_publications_v_version_related_links_parent_id_idx" ON "_publications_v_version_related_links" USING btree ("_parent_id");
  CREATE INDEX "_publications_v_parent_idx" ON "_publications_v" USING btree ("parent_id");
  CREATE INDEX "_publications_v_version_version_document_idx" ON "_publications_v" USING btree ("version_document_id");
  CREATE INDEX "_publications_v_version_version_image_idx" ON "_publications_v" USING btree ("version_image_id");
  CREATE INDEX "_publications_v_version_seo_version_seo_image_idx" ON "_publications_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_publications_v_version_version_slug_idx" ON "_publications_v" USING btree ("version_slug");
  CREATE INDEX "_publications_v_version_version_status_idx" ON "_publications_v" USING btree ("version_status");
  CREATE INDEX "_publications_v_version_version_published_at_idx" ON "_publications_v" USING btree ("version_published_at");
  CREATE INDEX "_publications_v_version_version_author_idx" ON "_publications_v" USING btree ("version_author_id");
  CREATE INDEX "_publications_v_version_version_updated_at_idx" ON "_publications_v" USING btree ("version_updated_at");
  CREATE INDEX "_publications_v_version_version_created_at_idx" ON "_publications_v" USING btree ("version_created_at");
  CREATE INDEX "_publications_v_created_at_idx" ON "_publications_v" USING btree ("created_at");
  CREATE INDEX "_publications_v_updated_at_idx" ON "_publications_v" USING btree ("updated_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_desk_updates_fk" FOREIGN KEY ("desk_updates_id") REFERENCES "public"."desk_updates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_desk_updates_id_idx" ON "payload_locked_documents_rels" USING btree ("desk_updates_id");
  CREATE INDEX "payload_locked_documents_rels_stories_id_idx" ON "payload_locked_documents_rels" USING btree ("stories_id");
  CREATE INDEX "payload_locked_documents_rels_publications_id_idx" ON "payload_locked_documents_rels" USING btree ("publications_id");
  ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "credit" varchar;
  `);
}

/** Removes the new collections. Cleared posts are not restored. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "desk_updates_social_enabled_platforms" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "desk_updates_related_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "desk_updates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_desk_updates_v_version_social_enabled_platforms" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_desk_updates_v_version_related_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_desk_updates_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "stories_topics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "stories_social_enabled_platforms" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "stories_related_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "stories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_stories_v_version_topics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_stories_v_version_social_enabled_platforms" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_stories_v_version_related_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_stories_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "publications_key_findings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "publications_topics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "publications_social_enabled_platforms" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "publications_related_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "publications" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_publications_v_version_key_findings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_publications_v_version_topics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_publications_v_version_social_enabled_platforms" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_publications_v_version_related_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_publications_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "desk_updates_social_enabled_platforms" CASCADE;
  DROP TABLE "desk_updates_related_links" CASCADE;
  DROP TABLE "desk_updates" CASCADE;
  DROP TABLE "_desk_updates_v_version_social_enabled_platforms" CASCADE;
  DROP TABLE "_desk_updates_v_version_related_links" CASCADE;
  DROP TABLE "_desk_updates_v" CASCADE;
  DROP TABLE "stories_topics" CASCADE;
  DROP TABLE "stories_social_enabled_platforms" CASCADE;
  DROP TABLE "stories_related_links" CASCADE;
  DROP TABLE "stories" CASCADE;
  DROP TABLE "_stories_v_version_topics" CASCADE;
  DROP TABLE "_stories_v_version_social_enabled_platforms" CASCADE;
  DROP TABLE "_stories_v_version_related_links" CASCADE;
  DROP TABLE "_stories_v" CASCADE;
  DROP TABLE "publications_key_findings" CASCADE;
  DROP TABLE "publications_topics" CASCADE;
  DROP TABLE "publications_social_enabled_platforms" CASCADE;
  DROP TABLE "publications_related_links" CASCADE;
  DROP TABLE "publications" CASCADE;
  DROP TABLE "_publications_v_version_key_findings" CASCADE;
  DROP TABLE "_publications_v_version_topics" CASCADE;
  DROP TABLE "_publications_v_version_social_enabled_platforms" CASCADE;
  DROP TABLE "_publications_v_version_related_links" CASCADE;
  DROP TABLE "_publications_v" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_desk_updates_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_stories_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_publications_fk";

  DROP INDEX "payload_locked_documents_rels_desk_updates_id_idx";
  DROP INDEX "payload_locked_documents_rels_stories_id_idx";
  DROP INDEX "payload_locked_documents_rels_publications_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "desk_updates_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "stories_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "publications_id";
  DROP TYPE "public"."enum_desk_updates_social_enabled_platforms";
  DROP TYPE "public"."enum_desk_updates_related_links_category";
  DROP TYPE "public"."enum_desk_updates_kind";
  DROP TYPE "public"."enum_desk_updates_product";
  DROP TYPE "public"."enum_desk_updates_status";
  DROP TYPE "public"."enum__desk_updates_v_version_social_enabled_platforms";
  DROP TYPE "public"."enum__desk_updates_v_version_related_links_category";
  DROP TYPE "public"."enum__desk_updates_v_version_kind";
  DROP TYPE "public"."enum__desk_updates_v_version_product";
  DROP TYPE "public"."enum__desk_updates_v_version_status";
  DROP TYPE "public"."enum_stories_topics";
  DROP TYPE "public"."enum_stories_social_enabled_platforms";
  DROP TYPE "public"."enum_stories_related_links_category";
  DROP TYPE "public"."enum_stories_kind";
  DROP TYPE "public"."enum_stories_status";
  DROP TYPE "public"."enum__stories_v_version_topics";
  DROP TYPE "public"."enum__stories_v_version_social_enabled_platforms";
  DROP TYPE "public"."enum__stories_v_version_related_links_category";
  DROP TYPE "public"."enum__stories_v_version_kind";
  DROP TYPE "public"."enum__stories_v_version_status";
  DROP TYPE "public"."enum_publications_topics";
  DROP TYPE "public"."enum_publications_social_enabled_platforms";
  DROP TYPE "public"."enum_publications_related_links_category";
  DROP TYPE "public"."enum_publications_type";
  DROP TYPE "public"."enum_publications_series";
  DROP TYPE "public"."enum_publications_status";
  DROP TYPE "public"."enum__publications_v_version_topics";
  DROP TYPE "public"."enum__publications_v_version_social_enabled_platforms";
  DROP TYPE "public"."enum__publications_v_version_related_links_category";
  DROP TYPE "public"."enum__publications_v_version_type";
  DROP TYPE "public"."enum__publications_v_version_series";
  DROP TYPE "public"."enum__publications_v_version_status";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "credit";
  `);
}
