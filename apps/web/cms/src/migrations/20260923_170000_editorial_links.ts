import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "enum_content_update_type" ADD VALUE IF NOT EXISTS 'Tropical weather outlook';
    ALTER TYPE "enum_content_update_type" ADD VALUE IF NOT EXISTS 'Bulletin';
    ALTER TYPE "enum_content_update_type" ADD VALUE IF NOT EXISTS 'Forecasts';
    ALTER TYPE "enum_content_update_type" ADD VALUE IF NOT EXISTS 'Marine';
    ALTER TYPE "enum_content_update_type" ADD VALUE IF NOT EXISTS 'Aviation';
    ALTER TYPE "enum_content_update_type" ADD VALUE IF NOT EXISTS 'CAP alerts';
    CREATE TYPE "enum_content_related_links_category" AS ENUM ('forecast','cap','aviation','bulletin','publication','article','source');
    CREATE TYPE "enum__content_v_version_related_links_category" AS ENUM ('forecast','cap','aviation','bulletin','publication','article','source');
    CREATE TABLE "content_related_links" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL REFERENCES "content"("id") ON DELETE CASCADE,
      "id" varchar PRIMARY KEY NOT NULL,
      "title" varchar NOT NULL,
      "category" "enum_content_related_links_category" NOT NULL,
      "url" varchar NOT NULL
    );
    CREATE INDEX "content_related_links_order_idx" ON "content_related_links" ("_order");
    CREATE INDEX "content_related_links_parent_id_idx" ON "content_related_links" ("_parent_id");
    CREATE TABLE "_content_v_version_related_links" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL REFERENCES "_content_v"("id") ON DELETE CASCADE,
      "id" serial PRIMARY KEY NOT NULL,
      "title" varchar,
      "category" "enum__content_v_version_related_links_category",
      "url" varchar,
      "_uuid" varchar
    );
    CREATE INDEX "_content_v_version_related_links_order_idx" ON "_content_v_version_related_links" ("_order");
    CREATE INDEX "_content_v_version_related_links_parent_id_idx" ON "_content_v_version_related_links" ("_parent_id");
  `);
}

export function down(_args: MigrateDownArgs): Promise<void> {
  return Promise.reject(
    new Error(
      "Editorial links and product categories may contain published history. Restore the pre-migration backup or approve a data-preserving rollback plan."
    )
  );
}
