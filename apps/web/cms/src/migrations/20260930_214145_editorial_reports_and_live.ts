import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

/** Report write-ups, Weather now live posts and desk product links (additive). */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_report_notes_topics" AS ENUM('tropical', 'rain', 'heat', 'marine', 'climate', 'sky', 'safety', 'agriculture', 'aviation', 'gms');
  CREATE TYPE "public"."enum_report_notes_social_enabled_platforms" AS ENUM('X', 'Facebook', 'Instagram', 'YouTube', 'LinkedIn', 'WhatsApp Channel');
  CREATE TYPE "public"."enum_report_notes_related_links_category" AS ENUM('forecast', 'cap', 'aviation', 'bulletin', 'publication', 'article', 'source');
  CREATE TYPE "public"."enum_report_notes_status" AS ENUM('draft', 'review', 'published');
  CREATE TYPE "public"."enum__report_notes_v_version_topics" AS ENUM('tropical', 'rain', 'heat', 'marine', 'climate', 'sky', 'safety', 'agriculture', 'aviation', 'gms');
  CREATE TYPE "public"."enum__report_notes_v_version_social_enabled_platforms" AS ENUM('X', 'Facebook', 'Instagram', 'YouTube', 'LinkedIn', 'WhatsApp Channel');
  CREATE TYPE "public"."enum__report_notes_v_version_related_links_category" AS ENUM('forecast', 'cap', 'aviation', 'bulletin', 'publication', 'article', 'source');
  CREATE TYPE "public"."enum__report_notes_v_version_status" AS ENUM('draft', 'review', 'published');
  CREATE TYPE "public"."enum_live_posts_related_links_category" AS ENUM('forecast', 'cap', 'aviation', 'bulletin', 'publication', 'article', 'source');
  CREATE TYPE "public"."enum_live_posts_kind" AS ENUM('update', 'video', 'audio');
  CREATE TYPE "public"."enum_live_posts_status" AS ENUM('draft', 'review', 'published');
  CREATE TYPE "public"."enum__live_posts_v_version_related_links_category" AS ENUM('forecast', 'cap', 'aviation', 'bulletin', 'publication', 'article', 'source');
  CREATE TYPE "public"."enum__live_posts_v_version_kind" AS ENUM('update', 'video', 'audio');
  CREATE TYPE "public"."enum__live_posts_v_version_status" AS ENUM('draft', 'review', 'published');
  CREATE TABLE "report_notes_topics" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_report_notes_topics",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "report_notes_social_enabled_platforms" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_report_notes_social_enabled_platforms",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "report_notes_related_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"category" "enum_report_notes_related_links_category" NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "report_notes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"linked_product_product_id" varchar NOT NULL,
  	"linked_product_kind" varchar,
  	"summary" varchar NOT NULL,
  	"image_id" integer,
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
  	"status" "enum_report_notes_status" DEFAULT 'draft' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"author_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_report_notes_v_version_topics" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__report_notes_v_version_topics",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_report_notes_v_version_social_enabled_platforms" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__report_notes_v_version_social_enabled_platforms",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_report_notes_v_version_related_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"category" "enum__report_notes_v_version_related_links_category" NOT NULL,
  	"url" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_report_notes_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar NOT NULL,
  	"version_linked_product_product_id" varchar NOT NULL,
  	"version_linked_product_kind" varchar,
  	"version_summary" varchar NOT NULL,
  	"version_image_id" integer,
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
  	"version_status" "enum__report_notes_v_version_status" DEFAULT 'draft' NOT NULL,
  	"version_published_at" timestamp(3) with time zone,
  	"version_author_id" integer NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "live_posts_related_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"category" "enum_live_posts_related_links_category" NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "live_posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"kind" "enum_live_posts_kind" DEFAULT 'update' NOT NULL,
  	"text" varchar,
  	"media_url" varchar,
  	"expires_at" timestamp(3) with time zone,
  	"slug" varchar NOT NULL,
  	"status" "enum_live_posts_status" DEFAULT 'draft' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"author_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_live_posts_v_version_related_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"category" "enum__live_posts_v_version_related_links_category" NOT NULL,
  	"url" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_live_posts_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar NOT NULL,
  	"version_kind" "enum__live_posts_v_version_kind" DEFAULT 'update' NOT NULL,
  	"version_text" varchar,
  	"version_media_url" varchar,
  	"version_expires_at" timestamp(3) with time zone,
  	"version_slug" varchar NOT NULL,
  	"version_status" "enum__live_posts_v_version_status" DEFAULT 'draft' NOT NULL,
  	"version_published_at" timestamp(3) with time zone,
  	"version_author_id" integer NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "desk_updates" ADD COLUMN "linked_product_product_id" varchar;
  ALTER TABLE "desk_updates" ADD COLUMN "linked_product_kind" varchar;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_linked_product_product_id" varchar;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_linked_product_kind" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "report_notes_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "live_posts_id" integer;
  ALTER TABLE "report_notes_topics" ADD CONSTRAINT "report_notes_topics_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."report_notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "report_notes_social_enabled_platforms" ADD CONSTRAINT "report_notes_social_enabled_platforms_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."report_notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "report_notes_related_links" ADD CONSTRAINT "report_notes_related_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."report_notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "report_notes" ADD CONSTRAINT "report_notes_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "report_notes" ADD CONSTRAINT "report_notes_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "report_notes" ADD CONSTRAINT "report_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_report_notes_v_version_topics" ADD CONSTRAINT "_report_notes_v_version_topics_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_report_notes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_report_notes_v_version_social_enabled_platforms" ADD CONSTRAINT "_report_notes_v_version_social_enabled_platforms_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_report_notes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_report_notes_v_version_related_links" ADD CONSTRAINT "_report_notes_v_version_related_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_report_notes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_report_notes_v" ADD CONSTRAINT "_report_notes_v_parent_id_report_notes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."report_notes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_report_notes_v" ADD CONSTRAINT "_report_notes_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_report_notes_v" ADD CONSTRAINT "_report_notes_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_report_notes_v" ADD CONSTRAINT "_report_notes_v_version_author_id_users_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_posts_related_links" ADD CONSTRAINT "live_posts_related_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."live_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "live_posts" ADD CONSTRAINT "live_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_live_posts_v_version_related_links" ADD CONSTRAINT "_live_posts_v_version_related_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_live_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_live_posts_v" ADD CONSTRAINT "_live_posts_v_parent_id_live_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."live_posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_live_posts_v" ADD CONSTRAINT "_live_posts_v_version_author_id_users_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "report_notes_topics_order_idx" ON "report_notes_topics" USING btree ("order");
  CREATE INDEX "report_notes_topics_parent_idx" ON "report_notes_topics" USING btree ("parent_id");
  CREATE INDEX "report_notes_social_enabled_platforms_order_idx" ON "report_notes_social_enabled_platforms" USING btree ("order");
  CREATE INDEX "report_notes_social_enabled_platforms_parent_idx" ON "report_notes_social_enabled_platforms" USING btree ("parent_id");
  CREATE INDEX "report_notes_related_links_order_idx" ON "report_notes_related_links" USING btree ("_order");
  CREATE INDEX "report_notes_related_links_parent_id_idx" ON "report_notes_related_links" USING btree ("_parent_id");
  CREATE INDEX "report_notes_image_idx" ON "report_notes" USING btree ("image_id");
  CREATE INDEX "report_notes_seo_seo_image_idx" ON "report_notes" USING btree ("seo_image_id");
  CREATE UNIQUE INDEX "report_notes_slug_idx" ON "report_notes" USING btree ("slug");
  CREATE INDEX "report_notes_status_idx" ON "report_notes" USING btree ("status");
  CREATE INDEX "report_notes_published_at_idx" ON "report_notes" USING btree ("published_at");
  CREATE INDEX "report_notes_author_idx" ON "report_notes" USING btree ("author_id");
  CREATE INDEX "report_notes_updated_at_idx" ON "report_notes" USING btree ("updated_at");
  CREATE INDEX "report_notes_created_at_idx" ON "report_notes" USING btree ("created_at");
  CREATE INDEX "_report_notes_v_version_topics_order_idx" ON "_report_notes_v_version_topics" USING btree ("order");
  CREATE INDEX "_report_notes_v_version_topics_parent_idx" ON "_report_notes_v_version_topics" USING btree ("parent_id");
  CREATE INDEX "_report_notes_v_version_social_enabled_platforms_order_idx" ON "_report_notes_v_version_social_enabled_platforms" USING btree ("order");
  CREATE INDEX "_report_notes_v_version_social_enabled_platforms_parent_idx" ON "_report_notes_v_version_social_enabled_platforms" USING btree ("parent_id");
  CREATE INDEX "_report_notes_v_version_related_links_order_idx" ON "_report_notes_v_version_related_links" USING btree ("_order");
  CREATE INDEX "_report_notes_v_version_related_links_parent_id_idx" ON "_report_notes_v_version_related_links" USING btree ("_parent_id");
  CREATE INDEX "_report_notes_v_parent_idx" ON "_report_notes_v" USING btree ("parent_id");
  CREATE INDEX "_report_notes_v_version_version_image_idx" ON "_report_notes_v" USING btree ("version_image_id");
  CREATE INDEX "_report_notes_v_version_seo_version_seo_image_idx" ON "_report_notes_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_report_notes_v_version_version_slug_idx" ON "_report_notes_v" USING btree ("version_slug");
  CREATE INDEX "_report_notes_v_version_version_status_idx" ON "_report_notes_v" USING btree ("version_status");
  CREATE INDEX "_report_notes_v_version_version_published_at_idx" ON "_report_notes_v" USING btree ("version_published_at");
  CREATE INDEX "_report_notes_v_version_version_author_idx" ON "_report_notes_v" USING btree ("version_author_id");
  CREATE INDEX "_report_notes_v_version_version_updated_at_idx" ON "_report_notes_v" USING btree ("version_updated_at");
  CREATE INDEX "_report_notes_v_version_version_created_at_idx" ON "_report_notes_v" USING btree ("version_created_at");
  CREATE INDEX "_report_notes_v_created_at_idx" ON "_report_notes_v" USING btree ("created_at");
  CREATE INDEX "_report_notes_v_updated_at_idx" ON "_report_notes_v" USING btree ("updated_at");
  CREATE INDEX "live_posts_related_links_order_idx" ON "live_posts_related_links" USING btree ("_order");
  CREATE INDEX "live_posts_related_links_parent_id_idx" ON "live_posts_related_links" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "live_posts_slug_idx" ON "live_posts" USING btree ("slug");
  CREATE INDEX "live_posts_status_idx" ON "live_posts" USING btree ("status");
  CREATE INDEX "live_posts_published_at_idx" ON "live_posts" USING btree ("published_at");
  CREATE INDEX "live_posts_author_idx" ON "live_posts" USING btree ("author_id");
  CREATE INDEX "live_posts_updated_at_idx" ON "live_posts" USING btree ("updated_at");
  CREATE INDEX "live_posts_created_at_idx" ON "live_posts" USING btree ("created_at");
  CREATE INDEX "_live_posts_v_version_related_links_order_idx" ON "_live_posts_v_version_related_links" USING btree ("_order");
  CREATE INDEX "_live_posts_v_version_related_links_parent_id_idx" ON "_live_posts_v_version_related_links" USING btree ("_parent_id");
  CREATE INDEX "_live_posts_v_parent_idx" ON "_live_posts_v" USING btree ("parent_id");
  CREATE INDEX "_live_posts_v_version_version_slug_idx" ON "_live_posts_v" USING btree ("version_slug");
  CREATE INDEX "_live_posts_v_version_version_status_idx" ON "_live_posts_v" USING btree ("version_status");
  CREATE INDEX "_live_posts_v_version_version_published_at_idx" ON "_live_posts_v" USING btree ("version_published_at");
  CREATE INDEX "_live_posts_v_version_version_author_idx" ON "_live_posts_v" USING btree ("version_author_id");
  CREATE INDEX "_live_posts_v_version_version_updated_at_idx" ON "_live_posts_v" USING btree ("version_updated_at");
  CREATE INDEX "_live_posts_v_version_version_created_at_idx" ON "_live_posts_v" USING btree ("version_created_at");
  CREATE INDEX "_live_posts_v_created_at_idx" ON "_live_posts_v" USING btree ("created_at");
  CREATE INDEX "_live_posts_v_updated_at_idx" ON "_live_posts_v" USING btree ("updated_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_report_notes_fk" FOREIGN KEY ("report_notes_id") REFERENCES "public"."report_notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_live_posts_fk" FOREIGN KEY ("live_posts_id") REFERENCES "public"."live_posts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_report_notes_id_idx" ON "payload_locked_documents_rels" USING btree ("report_notes_id");
  CREATE INDEX "payload_locked_documents_rels_live_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("live_posts_id");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "report_notes_topics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "report_notes_social_enabled_platforms" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "report_notes_related_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "report_notes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_report_notes_v_version_topics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_report_notes_v_version_social_enabled_platforms" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_report_notes_v_version_related_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_report_notes_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "live_posts_related_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "live_posts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_live_posts_v_version_related_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_live_posts_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "report_notes_topics" CASCADE;
  DROP TABLE "report_notes_social_enabled_platforms" CASCADE;
  DROP TABLE "report_notes_related_links" CASCADE;
  DROP TABLE "report_notes" CASCADE;
  DROP TABLE "_report_notes_v_version_topics" CASCADE;
  DROP TABLE "_report_notes_v_version_social_enabled_platforms" CASCADE;
  DROP TABLE "_report_notes_v_version_related_links" CASCADE;
  DROP TABLE "_report_notes_v" CASCADE;
  DROP TABLE "live_posts_related_links" CASCADE;
  DROP TABLE "live_posts" CASCADE;
  DROP TABLE "_live_posts_v_version_related_links" CASCADE;
  DROP TABLE "_live_posts_v" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_report_notes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_live_posts_fk";
  
  DROP INDEX "payload_locked_documents_rels_report_notes_id_idx";
  DROP INDEX "payload_locked_documents_rels_live_posts_id_idx";
  ALTER TABLE "desk_updates" DROP COLUMN "linked_product_product_id";
  ALTER TABLE "desk_updates" DROP COLUMN "linked_product_kind";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_linked_product_product_id";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_linked_product_kind";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "report_notes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "live_posts_id";
  DROP TYPE "public"."enum_report_notes_topics";
  DROP TYPE "public"."enum_report_notes_social_enabled_platforms";
  DROP TYPE "public"."enum_report_notes_related_links_category";
  DROP TYPE "public"."enum_report_notes_status";
  DROP TYPE "public"."enum__report_notes_v_version_topics";
  DROP TYPE "public"."enum__report_notes_v_version_social_enabled_platforms";
  DROP TYPE "public"."enum__report_notes_v_version_related_links_category";
  DROP TYPE "public"."enum__report_notes_v_version_status";
  DROP TYPE "public"."enum_live_posts_related_links_category";
  DROP TYPE "public"."enum_live_posts_kind";
  DROP TYPE "public"."enum_live_posts_status";
  DROP TYPE "public"."enum__live_posts_v_version_related_links_category";
  DROP TYPE "public"."enum__live_posts_v_version_kind";
  DROP TYPE "public"."enum__live_posts_v_version_status";`);
}
