import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(
      `CREATE TABLE "content_social_enabled_platforms" ("id" serial PRIMARY KEY NOT NULL, "order" integer NOT NULL, "parent_id" integer NOT NULL, "value" varchar NOT NULL); CREATE INDEX "content_social_enabled_platformsorder_idx" ON "content_social_enabled_platforms" USING btree ("order"); CREATE INDEX "content_social_enabled_platformsparent_id_idx" ON "content_social_enabled_platforms" USING btree ("parent_id"); ALTER TABLE "content_social_enabled_platforms" ADD CONSTRAINT "content_social_enabled_platformsparent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "content"("id") ON DELETE cascade ON UPDATE no action; CREATE TABLE "_content_v_social_enabled_platforms" ("id" serial PRIMARY KEY NOT NULL, "order" integer NOT NULL, "parent_id" integer NOT NULL, "value" varchar NOT NULL); CREATE INDEX "_content_v_social_enabled_platformsorder_idx" ON "_content_v_social_enabled_platforms" USING btree ("order"); CREATE INDEX "_content_v_social_enabled_platformsparent_id_idx" ON "_content_v_social_enabled_platforms" USING btree ("parent_id"); ALTER TABLE "_content_v_social_enabled_platforms" ADD CONSTRAINT "_content_v_social_enabled_platformsparent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "_content_v"("id") ON DELETE cascade ON UPDATE no action;`
    )
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(
      `DROP TABLE "_content_v_social_enabled_platforms"; DROP TABLE "content_social_enabled_platforms";`
    )
  );
}
