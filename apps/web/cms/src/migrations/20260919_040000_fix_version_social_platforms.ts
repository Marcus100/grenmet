import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "_content_v_social_enabled_platforms" RENAME TO "_content_v_version_social_enabled_platforms";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "_content_v_version_social_enabled_platforms" RENAME TO "_content_v_social_enabled_platforms";
  `);
}
