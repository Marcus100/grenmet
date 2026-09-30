import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

/** Sky, history and a little fun (discover). */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_discover_topics" AS ENUM('tropical', 'rain', 'heat', 'marine', 'climate', 'sky', 'safety', 'agriculture', 'aviation', 'gms');
  CREATE TYPE "public"."enum_discover_type" AS ENUM('on-this-day', 'quiz', 'fact', 'sky-note');
  CREATE TYPE "public"."enum_discover_month" AS ENUM('1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12');
  CREATE TYPE "public"."enum_discover_status" AS ENUM('draft', 'review', 'published');
  CREATE TYPE "public"."enum__discover_v_version_topics" AS ENUM('tropical', 'rain', 'heat', 'marine', 'climate', 'sky', 'safety', 'agriculture', 'aviation', 'gms');
  CREATE TYPE "public"."enum__discover_v_version_type" AS ENUM('on-this-day', 'quiz', 'fact', 'sky-note');
  CREATE TYPE "public"."enum__discover_v_version_month" AS ENUM('1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12');
  CREATE TYPE "public"."enum__discover_v_version_status" AS ENUM('draft', 'review', 'published');
  CREATE TABLE "discover_questions_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "discover_questions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"prompt" varchar,
  	"correct" numeric,
  	"explanation" varchar
  );
  
  CREATE TABLE "discover_topics" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_discover_topics",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "discover" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum_discover_type" DEFAULT 'on-this-day' NOT NULL,
  	"title" varchar NOT NULL,
  	"day" numeric,
  	"month" "enum_discover_month",
  	"year" numeric,
  	"what_happened" varchar,
  	"story_id" integer,
  	"intro" varchar,
  	"fact" varchar,
  	"source" varchar,
  	"source_url" varchar,
  	"note" varchar,
  	"starts_on" timestamp(3) with time zone,
  	"ends_on" timestamp(3) with time zone,
  	"image_id" integer,
  	"image_caption" varchar,
  	"slug" varchar NOT NULL,
  	"status" "enum_discover_status" DEFAULT 'draft' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"author_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_discover_v_version_questions_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_discover_v_version_questions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"prompt" varchar,
  	"correct" numeric,
  	"explanation" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_discover_v_version_topics" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__discover_v_version_topics",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_discover_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_type" "enum__discover_v_version_type" DEFAULT 'on-this-day' NOT NULL,
  	"version_title" varchar NOT NULL,
  	"version_day" numeric,
  	"version_month" "enum__discover_v_version_month",
  	"version_year" numeric,
  	"version_what_happened" varchar,
  	"version_story_id" integer,
  	"version_intro" varchar,
  	"version_fact" varchar,
  	"version_source" varchar,
  	"version_source_url" varchar,
  	"version_note" varchar,
  	"version_starts_on" timestamp(3) with time zone,
  	"version_ends_on" timestamp(3) with time zone,
  	"version_image_id" integer,
  	"version_image_caption" varchar,
  	"version_slug" varchar NOT NULL,
  	"version_status" "enum__discover_v_version_status" DEFAULT 'draft' NOT NULL,
  	"version_published_at" timestamp(3) with time zone,
  	"version_author_id" integer NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "discover_id" integer;
  ALTER TABLE "discover_questions_options" ADD CONSTRAINT "discover_questions_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."discover_questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discover_questions" ADD CONSTRAINT "discover_questions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."discover"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discover_topics" ADD CONSTRAINT "discover_topics_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."discover"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discover" ADD CONSTRAINT "discover_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discover" ADD CONSTRAINT "discover_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discover" ADD CONSTRAINT "discover_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_discover_v_version_questions_options" ADD CONSTRAINT "_discover_v_version_questions_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_discover_v_version_questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_discover_v_version_questions" ADD CONSTRAINT "_discover_v_version_questions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_discover_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_discover_v_version_topics" ADD CONSTRAINT "_discover_v_version_topics_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_discover_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_discover_v" ADD CONSTRAINT "_discover_v_parent_id_discover_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."discover"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_discover_v" ADD CONSTRAINT "_discover_v_version_story_id_stories_id_fk" FOREIGN KEY ("version_story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_discover_v" ADD CONSTRAINT "_discover_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_discover_v" ADD CONSTRAINT "_discover_v_version_author_id_users_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "discover_questions_options_order_idx" ON "discover_questions_options" USING btree ("_order");
  CREATE INDEX "discover_questions_options_parent_id_idx" ON "discover_questions_options" USING btree ("_parent_id");
  CREATE INDEX "discover_questions_order_idx" ON "discover_questions" USING btree ("_order");
  CREATE INDEX "discover_questions_parent_id_idx" ON "discover_questions" USING btree ("_parent_id");
  CREATE INDEX "discover_topics_order_idx" ON "discover_topics" USING btree ("order");
  CREATE INDEX "discover_topics_parent_idx" ON "discover_topics" USING btree ("parent_id");
  CREATE INDEX "discover_story_idx" ON "discover" USING btree ("story_id");
  CREATE INDEX "discover_image_idx" ON "discover" USING btree ("image_id");
  CREATE UNIQUE INDEX "discover_slug_idx" ON "discover" USING btree ("slug");
  CREATE INDEX "discover_status_idx" ON "discover" USING btree ("status");
  CREATE INDEX "discover_published_at_idx" ON "discover" USING btree ("published_at");
  CREATE INDEX "discover_author_idx" ON "discover" USING btree ("author_id");
  CREATE INDEX "discover_updated_at_idx" ON "discover" USING btree ("updated_at");
  CREATE INDEX "discover_created_at_idx" ON "discover" USING btree ("created_at");
  CREATE INDEX "_discover_v_version_questions_options_order_idx" ON "_discover_v_version_questions_options" USING btree ("_order");
  CREATE INDEX "_discover_v_version_questions_options_parent_id_idx" ON "_discover_v_version_questions_options" USING btree ("_parent_id");
  CREATE INDEX "_discover_v_version_questions_order_idx" ON "_discover_v_version_questions" USING btree ("_order");
  CREATE INDEX "_discover_v_version_questions_parent_id_idx" ON "_discover_v_version_questions" USING btree ("_parent_id");
  CREATE INDEX "_discover_v_version_topics_order_idx" ON "_discover_v_version_topics" USING btree ("order");
  CREATE INDEX "_discover_v_version_topics_parent_idx" ON "_discover_v_version_topics" USING btree ("parent_id");
  CREATE INDEX "_discover_v_parent_idx" ON "_discover_v" USING btree ("parent_id");
  CREATE INDEX "_discover_v_version_version_story_idx" ON "_discover_v" USING btree ("version_story_id");
  CREATE INDEX "_discover_v_version_version_image_idx" ON "_discover_v" USING btree ("version_image_id");
  CREATE INDEX "_discover_v_version_version_slug_idx" ON "_discover_v" USING btree ("version_slug");
  CREATE INDEX "_discover_v_version_version_status_idx" ON "_discover_v" USING btree ("version_status");
  CREATE INDEX "_discover_v_version_version_published_at_idx" ON "_discover_v" USING btree ("version_published_at");
  CREATE INDEX "_discover_v_version_version_author_idx" ON "_discover_v" USING btree ("version_author_id");
  CREATE INDEX "_discover_v_version_version_updated_at_idx" ON "_discover_v" USING btree ("version_updated_at");
  CREATE INDEX "_discover_v_version_version_created_at_idx" ON "_discover_v" USING btree ("version_created_at");
  CREATE INDEX "_discover_v_created_at_idx" ON "_discover_v" USING btree ("created_at");
  CREATE INDEX "_discover_v_updated_at_idx" ON "_discover_v" USING btree ("updated_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_discover_fk" FOREIGN KEY ("discover_id") REFERENCES "public"."discover"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_discover_id_idx" ON "payload_locked_documents_rels" USING btree ("discover_id");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "discover_questions_options" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "discover_questions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "discover_topics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "discover" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_discover_v_version_questions_options" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_discover_v_version_questions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_discover_v_version_topics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_discover_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "discover_questions_options" CASCADE;
  DROP TABLE "discover_questions" CASCADE;
  DROP TABLE "discover_topics" CASCADE;
  DROP TABLE "discover" CASCADE;
  DROP TABLE "_discover_v_version_questions_options" CASCADE;
  DROP TABLE "_discover_v_version_questions" CASCADE;
  DROP TABLE "_discover_v_version_topics" CASCADE;
  DROP TABLE "_discover_v" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_discover_fk";
  
  DROP INDEX "payload_locked_documents_rels_discover_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "discover_id";
  DROP TYPE "public"."enum_discover_topics";
  DROP TYPE "public"."enum_discover_type";
  DROP TYPE "public"."enum_discover_month";
  DROP TYPE "public"."enum_discover_status";
  DROP TYPE "public"."enum__discover_v_version_topics";
  DROP TYPE "public"."enum__discover_v_version_type";
  DROP TYPE "public"."enum__discover_v_version_month";
  DROP TYPE "public"."enum__discover_v_version_status";`);
}
