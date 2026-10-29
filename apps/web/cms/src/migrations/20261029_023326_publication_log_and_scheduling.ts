import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

/**
 * Publication log and scheduled show / take-off times. Additive only: a new
 * table, a new value for the live post kind "note" (the duty forecaster's
 * note, copied over by the next migration), and two nullable time columns on
 * every editorial table and its version table. Nothing is dropped going
 * forward. The down step reverses only what this migration added.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_publication_log_action" AS ENUM('published', 'unpublished', 'scheduled-publish', 'scheduled-unpublish');
  ALTER TYPE "public"."enum_live_posts_kind" ADD VALUE 'note' BEFORE 'update';
  ALTER TYPE "public"."enum__live_posts_v_version_kind" ADD VALUE 'note' BEFORE 'update';
  CREATE TABLE "publication_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"action" "enum_publication_log_action" NOT NULL,
  	"collection" varchar NOT NULL,
  	"document_id" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"scheduled_for" timestamp(3) with time zone,
  	"actor_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "live_posts" ADD COLUMN "publish_at" timestamp(3) with time zone;
  ALTER TABLE "live_posts" ADD COLUMN "unpublish_at" timestamp(3) with time zone;
  ALTER TABLE "_live_posts_v" ADD COLUMN "version_publish_at" timestamp(3) with time zone;
  ALTER TABLE "_live_posts_v" ADD COLUMN "version_unpublish_at" timestamp(3) with time zone;
  ALTER TABLE "desk_updates" ADD COLUMN "publish_at" timestamp(3) with time zone;
  ALTER TABLE "desk_updates" ADD COLUMN "unpublish_at" timestamp(3) with time zone;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_publish_at" timestamp(3) with time zone;
  ALTER TABLE "_desk_updates_v" ADD COLUMN "version_unpublish_at" timestamp(3) with time zone;
  ALTER TABLE "report_notes" ADD COLUMN "publish_at" timestamp(3) with time zone;
  ALTER TABLE "report_notes" ADD COLUMN "unpublish_at" timestamp(3) with time zone;
  ALTER TABLE "_report_notes_v" ADD COLUMN "version_publish_at" timestamp(3) with time zone;
  ALTER TABLE "_report_notes_v" ADD COLUMN "version_unpublish_at" timestamp(3) with time zone;
  ALTER TABLE "stories" ADD COLUMN "publish_at" timestamp(3) with time zone;
  ALTER TABLE "stories" ADD COLUMN "unpublish_at" timestamp(3) with time zone;
  ALTER TABLE "_stories_v" ADD COLUMN "version_publish_at" timestamp(3) with time zone;
  ALTER TABLE "_stories_v" ADD COLUMN "version_unpublish_at" timestamp(3) with time zone;
  ALTER TABLE "questions" ADD COLUMN "publish_at" timestamp(3) with time zone;
  ALTER TABLE "questions" ADD COLUMN "unpublish_at" timestamp(3) with time zone;
  ALTER TABLE "_questions_v" ADD COLUMN "version_publish_at" timestamp(3) with time zone;
  ALTER TABLE "_questions_v" ADD COLUMN "version_unpublish_at" timestamp(3) with time zone;
  ALTER TABLE "discover" ADD COLUMN "publish_at" timestamp(3) with time zone;
  ALTER TABLE "discover" ADD COLUMN "unpublish_at" timestamp(3) with time zone;
  ALTER TABLE "_discover_v" ADD COLUMN "version_publish_at" timestamp(3) with time zone;
  ALTER TABLE "_discover_v" ADD COLUMN "version_unpublish_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "publication_log_id" integer;
  ALTER TABLE "publication_log" ADD CONSTRAINT "publication_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "publication_log_actor_idx" ON "publication_log" USING btree ("actor_id");
  CREATE INDEX "publication_log_updated_at_idx" ON "publication_log" USING btree ("updated_at");
  CREATE INDEX "publication_log_created_at_idx" ON "publication_log" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_publication_log_fk" FOREIGN KEY ("publication_log_id") REFERENCES "public"."publication_log"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_publication_log_id_idx" ON "payload_locked_documents_rels" USING btree ("publication_log_id");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "publication_log" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "publication_log" CASCADE;
  -- DROP TABLE ... CASCADE above already removes this foreign key; IF EXISTS keeps the rollback running.
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_publication_log_fk";

  -- The enum below is rebuilt without 'note', so rows of kind 'note' (live and
  -- version) become 'update' first; otherwise the cast back to the enum fails.
  UPDATE "live_posts" SET "kind" = 'update' WHERE "kind" = 'note';
  UPDATE "_live_posts_v" SET "version_kind" = 'update' WHERE "version_kind" = 'note';
  ALTER TABLE "live_posts" ALTER COLUMN "kind" SET DATA TYPE text;
  ALTER TABLE "live_posts" ALTER COLUMN "kind" SET DEFAULT 'update'::text;
  DROP TYPE "public"."enum_live_posts_kind";
  CREATE TYPE "public"."enum_live_posts_kind" AS ENUM('update', 'satellite', 'radar', 'wind', 'seas', 'video', 'audio');
  ALTER TABLE "live_posts" ALTER COLUMN "kind" SET DEFAULT 'update'::"public"."enum_live_posts_kind";
  ALTER TABLE "live_posts" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_live_posts_kind" USING "kind"::"public"."enum_live_posts_kind";
  ALTER TABLE "_live_posts_v" ALTER COLUMN "version_kind" SET DATA TYPE text;
  ALTER TABLE "_live_posts_v" ALTER COLUMN "version_kind" SET DEFAULT 'update'::text;
  DROP TYPE "public"."enum__live_posts_v_version_kind";
  CREATE TYPE "public"."enum__live_posts_v_version_kind" AS ENUM('update', 'satellite', 'radar', 'wind', 'seas', 'video', 'audio');
  ALTER TABLE "_live_posts_v" ALTER COLUMN "version_kind" SET DEFAULT 'update'::"public"."enum__live_posts_v_version_kind";
  ALTER TABLE "_live_posts_v" ALTER COLUMN "version_kind" SET DATA TYPE "public"."enum__live_posts_v_version_kind" USING "version_kind"::"public"."enum__live_posts_v_version_kind";
  DROP INDEX "payload_locked_documents_rels_publication_log_id_idx";
  ALTER TABLE "live_posts" DROP COLUMN "publish_at";
  ALTER TABLE "live_posts" DROP COLUMN "unpublish_at";
  ALTER TABLE "_live_posts_v" DROP COLUMN "version_publish_at";
  ALTER TABLE "_live_posts_v" DROP COLUMN "version_unpublish_at";
  ALTER TABLE "desk_updates" DROP COLUMN "publish_at";
  ALTER TABLE "desk_updates" DROP COLUMN "unpublish_at";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_publish_at";
  ALTER TABLE "_desk_updates_v" DROP COLUMN "version_unpublish_at";
  ALTER TABLE "report_notes" DROP COLUMN "publish_at";
  ALTER TABLE "report_notes" DROP COLUMN "unpublish_at";
  ALTER TABLE "_report_notes_v" DROP COLUMN "version_publish_at";
  ALTER TABLE "_report_notes_v" DROP COLUMN "version_unpublish_at";
  ALTER TABLE "stories" DROP COLUMN "publish_at";
  ALTER TABLE "stories" DROP COLUMN "unpublish_at";
  ALTER TABLE "_stories_v" DROP COLUMN "version_publish_at";
  ALTER TABLE "_stories_v" DROP COLUMN "version_unpublish_at";
  ALTER TABLE "questions" DROP COLUMN "publish_at";
  ALTER TABLE "questions" DROP COLUMN "unpublish_at";
  ALTER TABLE "_questions_v" DROP COLUMN "version_publish_at";
  ALTER TABLE "_questions_v" DROP COLUMN "version_unpublish_at";
  ALTER TABLE "discover" DROP COLUMN "publish_at";
  ALTER TABLE "discover" DROP COLUMN "unpublish_at";
  ALTER TABLE "_discover_v" DROP COLUMN "version_publish_at";
  ALTER TABLE "_discover_v" DROP COLUMN "version_unpublish_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "publication_log_id";
  DROP TYPE "public"."enum_publication_log_action";`);
}
