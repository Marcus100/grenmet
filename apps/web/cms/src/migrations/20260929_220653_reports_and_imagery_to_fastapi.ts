import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

/**
 * Reports and imagery are real data, so they move to FastAPI (29 Sep 2026):
 * drops the publications collection, its homepage pin and the Weather now
 * imagery cards. Any publications in the CMS are removed.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  -- Relation rows that point at publications would be left empty.
  DELETE FROM "questions_rels" WHERE "publications_id" IS NOT NULL;
  DELETE FROM "_questions_v_rels" WHERE "publications_id" IS NOT NULL;
  DELETE FROM "payload_locked_documents_rels" WHERE "publications_id" IS NOT NULL;
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
  ALTER TABLE "weather_now_imagery" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_weather_now_v_version_imagery" DISABLE ROW LEVEL SECURITY;
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
  DROP TABLE "weather_now_imagery" CASCADE;
  DROP TABLE "_weather_now_v_version_imagery" CASCADE;
  ALTER TABLE "questions_rels" DROP CONSTRAINT IF EXISTS "questions_rels_publications_fk";
  
  ALTER TABLE "_questions_v_rels" DROP CONSTRAINT IF EXISTS "_questions_v_rels_publications_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_publications_fk";
  
  ALTER TABLE "homepage" DROP CONSTRAINT IF EXISTS "homepage_featured_publication_id_publications_id_fk";
  
  ALTER TABLE "_homepage_v" DROP CONSTRAINT IF EXISTS "_homepage_v_version_featured_publication_id_publications_id_fk";
  
  DROP INDEX IF EXISTS "questions_rels_publications_id_idx";
  DROP INDEX IF EXISTS "_questions_v_rels_publications_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_publications_id_idx";
  DROP INDEX IF EXISTS "homepage_featured_publication_idx";
  DROP INDEX IF EXISTS "_homepage_v_version_version_featured_publication_idx";
  ALTER TABLE "questions_rels" DROP COLUMN "publications_id";
  ALTER TABLE "_questions_v_rels" DROP COLUMN "publications_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "publications_id";
  ALTER TABLE "homepage" DROP COLUMN "featured_publication_id";
  ALTER TABLE "_homepage_v" DROP COLUMN "version_featured_publication_id";
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
  DROP TYPE "public"."enum_weather_now_imagery_layer";
  DROP TYPE "public"."enum__weather_now_v_version_imagery_layer";`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
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
  CREATE TYPE "public"."enum_weather_now_imagery_layer" AS ENUM('satellite', 'radar', 'rainfall', 'lightning');
  CREATE TYPE "public"."enum__weather_now_v_version_imagery_layer" AS ENUM('satellite', 'radar', 'rainfall', 'lightning');
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
  
  CREATE TABLE "weather_now_imagery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"layer" "enum_weather_now_imagery_layer" NOT NULL,
  	"title" varchar NOT NULL,
  	"image_id" integer,
  	"image_url" varchar,
  	"href" varchar DEFAULT '/weather/satellite' NOT NULL,
  	"credit" varchar
  );
  
  CREATE TABLE "_weather_now_v_version_imagery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"layer" "enum__weather_now_v_version_imagery_layer" NOT NULL,
  	"title" varchar NOT NULL,
  	"image_id" integer,
  	"image_url" varchar,
  	"href" varchar DEFAULT '/weather/satellite' NOT NULL,
  	"credit" varchar,
  	"_uuid" varchar
  );
  
  ALTER TABLE "questions_rels" ADD COLUMN "publications_id" integer;
  ALTER TABLE "_questions_v_rels" ADD COLUMN "publications_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "publications_id" integer;
  ALTER TABLE "homepage" ADD COLUMN "featured_publication_id" integer;
  ALTER TABLE "_homepage_v" ADD COLUMN "version_featured_publication_id" integer;
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
  ALTER TABLE "weather_now_imagery" ADD CONSTRAINT "weather_now_imagery_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "weather_now_imagery" ADD CONSTRAINT "weather_now_imagery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."weather_now"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_weather_now_v_version_imagery" ADD CONSTRAINT "_weather_now_v_version_imagery_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_weather_now_v_version_imagery" ADD CONSTRAINT "_weather_now_v_version_imagery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_weather_now_v"("id") ON DELETE cascade ON UPDATE no action;
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
  CREATE INDEX "weather_now_imagery_order_idx" ON "weather_now_imagery" USING btree ("_order");
  CREATE INDEX "weather_now_imagery_parent_id_idx" ON "weather_now_imagery" USING btree ("_parent_id");
  CREATE INDEX "weather_now_imagery_image_idx" ON "weather_now_imagery" USING btree ("image_id");
  CREATE INDEX "_weather_now_v_version_imagery_order_idx" ON "_weather_now_v_version_imagery" USING btree ("_order");
  CREATE INDEX "_weather_now_v_version_imagery_parent_id_idx" ON "_weather_now_v_version_imagery" USING btree ("_parent_id");
  CREATE INDEX "_weather_now_v_version_imagery_image_idx" ON "_weather_now_v_version_imagery" USING btree ("image_id");
  ALTER TABLE "questions_rels" ADD CONSTRAINT "questions_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_questions_v_rels" ADD CONSTRAINT "_questions_v_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_featured_publication_id_publications_id_fk" FOREIGN KEY ("featured_publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_homepage_v" ADD CONSTRAINT "_homepage_v_version_featured_publication_id_publications_id_fk" FOREIGN KEY ("version_featured_publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "questions_rels_publications_id_idx" ON "questions_rels" USING btree ("publications_id");
  CREATE INDEX "_questions_v_rels_publications_id_idx" ON "_questions_v_rels" USING btree ("publications_id");
  CREATE INDEX "payload_locked_documents_rels_publications_id_idx" ON "payload_locked_documents_rels" USING btree ("publications_id");
  CREATE INDEX "homepage_featured_publication_idx" ON "homepage" USING btree ("featured_publication_id");
  CREATE INDEX "_homepage_v_version_version_featured_publication_idx" ON "_homepage_v" USING btree ("version_featured_publication_id");`);
}
