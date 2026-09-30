import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

/** Questions about the weather: question, answers, science check. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_questions_topics" AS ENUM('tropical', 'rain', 'heat', 'marine', 'climate', 'sky', 'safety', 'agriculture', 'aviation', 'gms');
  CREATE TYPE "public"."enum_questions_related_links_category" AS ENUM('forecast', 'cap', 'aviation', 'bulletin', 'publication', 'article', 'source');
  CREATE TYPE "public"."enum_questions_status" AS ENUM('draft', 'review', 'published');
  CREATE TYPE "public"."enum__questions_v_version_topics" AS ENUM('tropical', 'rain', 'heat', 'marine', 'climate', 'sky', 'safety', 'agriculture', 'aviation', 'gms');
  CREATE TYPE "public"."enum__questions_v_version_related_links_category" AS ENUM('forecast', 'cap', 'aviation', 'bulletin', 'publication', 'article', 'source');
  CREATE TYPE "public"."enum__questions_v_version_status" AS ENUM('draft', 'review', 'published');
  CREATE TABLE "questions_topics" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_questions_topics",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "questions_related_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"category" "enum_questions_related_links_category" NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "questions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar NOT NULL,
  	"short_answer" varchar NOT NULL,
  	"body" jsonb NOT NULL,
  	"science_check_checked" boolean,
  	"science_check_checked_at" timestamp(3) with time zone,
  	"science_check_checked_by_id" integer,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_image_id" integer,
  	"slug" varchar NOT NULL,
  	"status" "enum_questions_status" DEFAULT 'draft' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"author_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "questions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"questions_id" integer,
  	"stories_id" integer,
  	"publications_id" integer
  );
  
  CREATE TABLE "_questions_v_version_topics" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__questions_v_version_topics",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_questions_v_version_related_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"category" "enum__questions_v_version_related_links_category" NOT NULL,
  	"url" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_questions_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_question" varchar NOT NULL,
  	"version_short_answer" varchar NOT NULL,
  	"version_body" jsonb NOT NULL,
  	"version_science_check_checked" boolean,
  	"version_science_check_checked_at" timestamp(3) with time zone,
  	"version_science_check_checked_by_id" integer,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_image_id" integer,
  	"version_slug" varchar NOT NULL,
  	"version_status" "enum__questions_v_version_status" DEFAULT 'draft' NOT NULL,
  	"version_published_at" timestamp(3) with time zone,
  	"version_author_id" integer NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_questions_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"questions_id" integer,
  	"stories_id" integer,
  	"publications_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "questions_id" integer;
  ALTER TABLE "questions_topics" ADD CONSTRAINT "questions_topics_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "questions_related_links" ADD CONSTRAINT "questions_related_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "questions" ADD CONSTRAINT "questions_science_check_checked_by_id_users_id_fk" FOREIGN KEY ("science_check_checked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "questions" ADD CONSTRAINT "questions_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "questions" ADD CONSTRAINT "questions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "questions_rels" ADD CONSTRAINT "questions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "questions_rels" ADD CONSTRAINT "questions_rels_questions_fk" FOREIGN KEY ("questions_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "questions_rels" ADD CONSTRAINT "questions_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "questions_rels" ADD CONSTRAINT "questions_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_questions_v_version_topics" ADD CONSTRAINT "_questions_v_version_topics_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_questions_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_questions_v_version_related_links" ADD CONSTRAINT "_questions_v_version_related_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_questions_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_questions_v" ADD CONSTRAINT "_questions_v_parent_id_questions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_questions_v" ADD CONSTRAINT "_questions_v_version_science_check_checked_by_id_users_id_fk" FOREIGN KEY ("version_science_check_checked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_questions_v" ADD CONSTRAINT "_questions_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_questions_v" ADD CONSTRAINT "_questions_v_version_author_id_users_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_questions_v_rels" ADD CONSTRAINT "_questions_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_questions_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_questions_v_rels" ADD CONSTRAINT "_questions_v_rels_questions_fk" FOREIGN KEY ("questions_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_questions_v_rels" ADD CONSTRAINT "_questions_v_rels_stories_fk" FOREIGN KEY ("stories_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_questions_v_rels" ADD CONSTRAINT "_questions_v_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "questions_topics_order_idx" ON "questions_topics" USING btree ("order");
  CREATE INDEX "questions_topics_parent_idx" ON "questions_topics" USING btree ("parent_id");
  CREATE INDEX "questions_related_links_order_idx" ON "questions_related_links" USING btree ("_order");
  CREATE INDEX "questions_related_links_parent_id_idx" ON "questions_related_links" USING btree ("_parent_id");
  CREATE INDEX "questions_science_check_science_check_checked_by_idx" ON "questions" USING btree ("science_check_checked_by_id");
  CREATE INDEX "questions_seo_seo_image_idx" ON "questions" USING btree ("seo_image_id");
  CREATE UNIQUE INDEX "questions_slug_idx" ON "questions" USING btree ("slug");
  CREATE INDEX "questions_status_idx" ON "questions" USING btree ("status");
  CREATE INDEX "questions_published_at_idx" ON "questions" USING btree ("published_at");
  CREATE INDEX "questions_author_idx" ON "questions" USING btree ("author_id");
  CREATE INDEX "questions_updated_at_idx" ON "questions" USING btree ("updated_at");
  CREATE INDEX "questions_created_at_idx" ON "questions" USING btree ("created_at");
  CREATE INDEX "questions_rels_order_idx" ON "questions_rels" USING btree ("order");
  CREATE INDEX "questions_rels_parent_idx" ON "questions_rels" USING btree ("parent_id");
  CREATE INDEX "questions_rels_path_idx" ON "questions_rels" USING btree ("path");
  CREATE INDEX "questions_rels_questions_id_idx" ON "questions_rels" USING btree ("questions_id");
  CREATE INDEX "questions_rels_stories_id_idx" ON "questions_rels" USING btree ("stories_id");
  CREATE INDEX "questions_rels_publications_id_idx" ON "questions_rels" USING btree ("publications_id");
  CREATE INDEX "_questions_v_version_topics_order_idx" ON "_questions_v_version_topics" USING btree ("order");
  CREATE INDEX "_questions_v_version_topics_parent_idx" ON "_questions_v_version_topics" USING btree ("parent_id");
  CREATE INDEX "_questions_v_version_related_links_order_idx" ON "_questions_v_version_related_links" USING btree ("_order");
  CREATE INDEX "_questions_v_version_related_links_parent_id_idx" ON "_questions_v_version_related_links" USING btree ("_parent_id");
  CREATE INDEX "_questions_v_parent_idx" ON "_questions_v" USING btree ("parent_id");
  CREATE INDEX "_questions_v_version_science_check_version_science_check_idx" ON "_questions_v" USING btree ("version_science_check_checked_by_id");
  CREATE INDEX "_questions_v_version_seo_version_seo_image_idx" ON "_questions_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_questions_v_version_version_slug_idx" ON "_questions_v" USING btree ("version_slug");
  CREATE INDEX "_questions_v_version_version_status_idx" ON "_questions_v" USING btree ("version_status");
  CREATE INDEX "_questions_v_version_version_published_at_idx" ON "_questions_v" USING btree ("version_published_at");
  CREATE INDEX "_questions_v_version_version_author_idx" ON "_questions_v" USING btree ("version_author_id");
  CREATE INDEX "_questions_v_version_version_updated_at_idx" ON "_questions_v" USING btree ("version_updated_at");
  CREATE INDEX "_questions_v_version_version_created_at_idx" ON "_questions_v" USING btree ("version_created_at");
  CREATE INDEX "_questions_v_created_at_idx" ON "_questions_v" USING btree ("created_at");
  CREATE INDEX "_questions_v_updated_at_idx" ON "_questions_v" USING btree ("updated_at");
  CREATE INDEX "_questions_v_rels_order_idx" ON "_questions_v_rels" USING btree ("order");
  CREATE INDEX "_questions_v_rels_parent_idx" ON "_questions_v_rels" USING btree ("parent_id");
  CREATE INDEX "_questions_v_rels_path_idx" ON "_questions_v_rels" USING btree ("path");
  CREATE INDEX "_questions_v_rels_questions_id_idx" ON "_questions_v_rels" USING btree ("questions_id");
  CREATE INDEX "_questions_v_rels_stories_id_idx" ON "_questions_v_rels" USING btree ("stories_id");
  CREATE INDEX "_questions_v_rels_publications_id_idx" ON "_questions_v_rels" USING btree ("publications_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_questions_fk" FOREIGN KEY ("questions_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_questions_id_idx" ON "payload_locked_documents_rels" USING btree ("questions_id");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "questions_topics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "questions_related_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "questions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "questions_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_questions_v_version_topics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_questions_v_version_related_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_questions_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_questions_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "questions_topics" CASCADE;
  DROP TABLE "questions_related_links" CASCADE;
  DROP TABLE "questions" CASCADE;
  DROP TABLE "questions_rels" CASCADE;
  DROP TABLE "_questions_v_version_topics" CASCADE;
  DROP TABLE "_questions_v_version_related_links" CASCADE;
  DROP TABLE "_questions_v" CASCADE;
  DROP TABLE "_questions_v_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_questions_fk";
  
  DROP INDEX "payload_locked_documents_rels_questions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "questions_id";
  DROP TYPE "public"."enum_questions_topics";
  DROP TYPE "public"."enum_questions_related_links_category";
  DROP TYPE "public"."enum_questions_status";
  DROP TYPE "public"."enum__questions_v_version_topics";
  DROP TYPE "public"."enum__questions_v_version_related_links_category";
  DROP TYPE "public"."enum__questions_v_version_status";`);
}
