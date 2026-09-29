import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

/** Weather now and Homepage settings pages (globals). */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_weather_now_imagery_layer" AS ENUM('satellite', 'radar', 'rainfall', 'lightning');
  CREATE TYPE "public"."enum__weather_now_v_version_imagery_layer" AS ENUM('satellite', 'radar', 'rainfall', 'lightning');
  CREATE TYPE "public"."enum_homepage_discover_cards" AS ENUM('sky', 'on-this-day', 'quiz', 'fact');
  CREATE TYPE "public"."enum_homepage_hidden_sections" AS ENUM('weather-now', 'desk', 'stories', 'questions', 'discover', 'reports');
  CREATE TYPE "public"."enum__homepage_v_version_discover_cards" AS ENUM('sky', 'on-this-day', 'quiz', 'fact');
  CREATE TYPE "public"."enum__homepage_v_version_hidden_sections" AS ENUM('weather-now', 'desk', 'stories', 'questions', 'discover', 'reports');
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
  
  CREATE TABLE "weather_now" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"note_text" varchar,
  	"note_alert_url" varchar,
  	"note_expires_at" timestamp(3) with time zone,
  	"note_posted_at" timestamp(3) with time zone,
  	"note_posted_by_id" integer,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
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
  
  CREATE TABLE "_weather_now_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_note_text" varchar,
  	"version_note_alert_url" varchar,
  	"version_note_expires_at" timestamp(3) with time zone,
  	"version_note_posted_at" timestamp(3) with time zone,
  	"version_note_posted_by_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "homepage_discover_cards" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_homepage_discover_cards",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "homepage_hidden_sections" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_homepage_hidden_sections",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "homepage" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"lead_story_id" integer,
  	"featured_publication_id" integer,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "homepage_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"questions_id" integer
  );
  
  CREATE TABLE "_homepage_v_version_discover_cards" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__homepage_v_version_discover_cards",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_homepage_v_version_hidden_sections" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__homepage_v_version_hidden_sections",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_homepage_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_lead_story_id" integer,
  	"version_featured_publication_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_homepage_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"questions_id" integer
  );
  
  ALTER TABLE "weather_now_imagery" ADD CONSTRAINT "weather_now_imagery_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "weather_now_imagery" ADD CONSTRAINT "weather_now_imagery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."weather_now"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "weather_now" ADD CONSTRAINT "weather_now_note_posted_by_id_users_id_fk" FOREIGN KEY ("note_posted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_weather_now_v_version_imagery" ADD CONSTRAINT "_weather_now_v_version_imagery_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_weather_now_v_version_imagery" ADD CONSTRAINT "_weather_now_v_version_imagery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_weather_now_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_weather_now_v" ADD CONSTRAINT "_weather_now_v_version_note_posted_by_id_users_id_fk" FOREIGN KEY ("version_note_posted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage_discover_cards" ADD CONSTRAINT "homepage_discover_cards_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_hidden_sections" ADD CONSTRAINT "homepage_hidden_sections_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_lead_story_id_stories_id_fk" FOREIGN KEY ("lead_story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_featured_publication_id_publications_id_fk" FOREIGN KEY ("featured_publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage_rels" ADD CONSTRAINT "homepage_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_rels" ADD CONSTRAINT "homepage_rels_questions_fk" FOREIGN KEY ("questions_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v_version_discover_cards" ADD CONSTRAINT "_homepage_v_version_discover_cards_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_homepage_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v_version_hidden_sections" ADD CONSTRAINT "_homepage_v_version_hidden_sections_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_homepage_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v" ADD CONSTRAINT "_homepage_v_version_lead_story_id_stories_id_fk" FOREIGN KEY ("version_lead_story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_homepage_v" ADD CONSTRAINT "_homepage_v_version_featured_publication_id_publications_id_fk" FOREIGN KEY ("version_featured_publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_homepage_v_rels" ADD CONSTRAINT "_homepage_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_homepage_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v_rels" ADD CONSTRAINT "_homepage_v_rels_questions_fk" FOREIGN KEY ("questions_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "weather_now_imagery_order_idx" ON "weather_now_imagery" USING btree ("_order");
  CREATE INDEX "weather_now_imagery_parent_id_idx" ON "weather_now_imagery" USING btree ("_parent_id");
  CREATE INDEX "weather_now_imagery_image_idx" ON "weather_now_imagery" USING btree ("image_id");
  CREATE INDEX "weather_now_note_note_posted_by_idx" ON "weather_now" USING btree ("note_posted_by_id");
  CREATE INDEX "_weather_now_v_version_imagery_order_idx" ON "_weather_now_v_version_imagery" USING btree ("_order");
  CREATE INDEX "_weather_now_v_version_imagery_parent_id_idx" ON "_weather_now_v_version_imagery" USING btree ("_parent_id");
  CREATE INDEX "_weather_now_v_version_imagery_image_idx" ON "_weather_now_v_version_imagery" USING btree ("image_id");
  CREATE INDEX "_weather_now_v_version_note_version_note_posted_by_idx" ON "_weather_now_v" USING btree ("version_note_posted_by_id");
  CREATE INDEX "_weather_now_v_created_at_idx" ON "_weather_now_v" USING btree ("created_at");
  CREATE INDEX "_weather_now_v_updated_at_idx" ON "_weather_now_v" USING btree ("updated_at");
  CREATE INDEX "homepage_discover_cards_order_idx" ON "homepage_discover_cards" USING btree ("order");
  CREATE INDEX "homepage_discover_cards_parent_idx" ON "homepage_discover_cards" USING btree ("parent_id");
  CREATE INDEX "homepage_hidden_sections_order_idx" ON "homepage_hidden_sections" USING btree ("order");
  CREATE INDEX "homepage_hidden_sections_parent_idx" ON "homepage_hidden_sections" USING btree ("parent_id");
  CREATE INDEX "homepage_lead_story_idx" ON "homepage" USING btree ("lead_story_id");
  CREATE INDEX "homepage_featured_publication_idx" ON "homepage" USING btree ("featured_publication_id");
  CREATE INDEX "homepage_rels_order_idx" ON "homepage_rels" USING btree ("order");
  CREATE INDEX "homepage_rels_parent_idx" ON "homepage_rels" USING btree ("parent_id");
  CREATE INDEX "homepage_rels_path_idx" ON "homepage_rels" USING btree ("path");
  CREATE INDEX "homepage_rels_questions_id_idx" ON "homepage_rels" USING btree ("questions_id");
  CREATE INDEX "_homepage_v_version_discover_cards_order_idx" ON "_homepage_v_version_discover_cards" USING btree ("order");
  CREATE INDEX "_homepage_v_version_discover_cards_parent_idx" ON "_homepage_v_version_discover_cards" USING btree ("parent_id");
  CREATE INDEX "_homepage_v_version_hidden_sections_order_idx" ON "_homepage_v_version_hidden_sections" USING btree ("order");
  CREATE INDEX "_homepage_v_version_hidden_sections_parent_idx" ON "_homepage_v_version_hidden_sections" USING btree ("parent_id");
  CREATE INDEX "_homepage_v_version_version_lead_story_idx" ON "_homepage_v" USING btree ("version_lead_story_id");
  CREATE INDEX "_homepage_v_version_version_featured_publication_idx" ON "_homepage_v" USING btree ("version_featured_publication_id");
  CREATE INDEX "_homepage_v_created_at_idx" ON "_homepage_v" USING btree ("created_at");
  CREATE INDEX "_homepage_v_updated_at_idx" ON "_homepage_v" USING btree ("updated_at");
  CREATE INDEX "_homepage_v_rels_order_idx" ON "_homepage_v_rels" USING btree ("order");
  CREATE INDEX "_homepage_v_rels_parent_idx" ON "_homepage_v_rels" USING btree ("parent_id");
  CREATE INDEX "_homepage_v_rels_path_idx" ON "_homepage_v_rels" USING btree ("path");
  CREATE INDEX "_homepage_v_rels_questions_id_idx" ON "_homepage_v_rels" USING btree ("questions_id");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "weather_now_imagery" CASCADE;
  DROP TABLE "weather_now" CASCADE;
  DROP TABLE "_weather_now_v_version_imagery" CASCADE;
  DROP TABLE "_weather_now_v" CASCADE;
  DROP TABLE "homepage_discover_cards" CASCADE;
  DROP TABLE "homepage_hidden_sections" CASCADE;
  DROP TABLE "homepage" CASCADE;
  DROP TABLE "homepage_rels" CASCADE;
  DROP TABLE "_homepage_v_version_discover_cards" CASCADE;
  DROP TABLE "_homepage_v_version_hidden_sections" CASCADE;
  DROP TABLE "_homepage_v" CASCADE;
  DROP TABLE "_homepage_v_rels" CASCADE;
  DROP TYPE "public"."enum_weather_now_imagery_layer";
  DROP TYPE "public"."enum__weather_now_v_version_imagery_layer";
  DROP TYPE "public"."enum_homepage_discover_cards";
  DROP TYPE "public"."enum_homepage_hidden_sections";
  DROP TYPE "public"."enum__homepage_v_version_discover_cards";
  DROP TYPE "public"."enum__homepage_v_version_hidden_sections";`);
}
