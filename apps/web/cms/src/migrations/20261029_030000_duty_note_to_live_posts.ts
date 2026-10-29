import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-postgres";

/**
 * The duty forecaster's note moves into Live posts, as a post of kind "note".
 * Additive: `weather_now` and its version table are left exactly as they are.
 * Only the current note is copied, and only if it has an expiry still ahead
 * (a note without one never showed on the site); a note
 * with a CAP alert address keeps it as its main related link. Runs once: it
 * does nothing if a note post already exists. Run after the enum migration
 * (`20261029_023326`), because a new enum value cannot be used in the same
 * transaction that adds it.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    INSERT INTO "live_posts" (
      "title", "kind", "text", "expires_at", "slug", "status",
      "published_at", "author_id", "updated_at", "created_at"
    )
    SELECT
      'Duty forecaster''s note',
      'note',
      left(btrim(w."note_text"), 280),
      w."note_expires_at",
      'live/duty-forecaster-note-' || w."id",
      'published',
      COALESCE(w."note_posted_at", now()),
      COALESCE(
        w."note_posted_by_id",
        (SELECT u."id" FROM "users" u ORDER BY u."id" LIMIT 1)
      ),
      now(),
      now()
    FROM "weather_now" w
    WHERE btrim(coalesce(w."note_text", '')) <> ''
      AND w."note_expires_at" > now()
      AND NOT EXISTS (SELECT 1 FROM "live_posts" WHERE "kind" = 'note')
      AND (
        w."note_posted_by_id" IS NOT NULL
        OR EXISTS (SELECT 1 FROM "users")
      );

    INSERT INTO "live_posts_related_links" (
      "_order", "_parent_id", "id", "title", "category", "url", "is_main"
    )
    SELECT
      1,
      lp."id",
      gen_random_uuid()::text,
      'CAP alert',
      'cap',
      btrim(w."note_alert_url"),
      true
    FROM "weather_now" w
    JOIN "live_posts" lp
      ON lp."slug" = 'live/duty-forecaster-note-' || w."id"
    WHERE lp."kind" = 'note'
      AND btrim(coalesce(w."note_alert_url", '')) ~* '^https?://[^[:space:]@]+$'
      AND NOT EXISTS (
        SELECT 1 FROM "live_posts_related_links" r WHERE r."_parent_id" = lp."id"
      );
  `);
}

/**
 * Not reversed: the copied posts may have been edited since, and deleting
 * them would lose the editors' work. Remove them by hand if needed.
 */
export async function down(_args: MigrateDownArgs): Promise<void> {
  // Intentionally empty: see the up migration.
}
