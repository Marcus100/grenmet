import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "content" ADD COLUMN "published_at" timestamptz;
    ALTER TABLE "_content_v" ADD COLUMN "version_published_at" timestamptz;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "_content_v" DROP COLUMN "version_published_at";
    ALTER TABLE "content" DROP COLUMN "published_at";
  `);
}
