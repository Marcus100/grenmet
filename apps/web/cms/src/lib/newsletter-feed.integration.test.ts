import { randomUUID } from "node:crypto";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres/drizzle";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig, getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PUBLISH_KEYS } from "../access";
import { DeskUpdates } from "../collections/desk-updates";
import { LivePosts } from "../collections/live-posts";
import { Media } from "../collections/media";
import { PublicationLog } from "../collections/publication-log";
import { ReportNotes } from "../collections/report-notes";
import { Stories } from "../collections/stories";
import { Users } from "../collections/users";
import { testDatabaseUrl } from "../env";
import type { User } from "../payload-types";
import { findNewsletterItems } from "./newsletter-feed";

const ORIGIN = "https://weather.example.test";
const DAY = 24 * 60 * 60 * 1000;

const FORECAST_URL =
  /^https:\/\/weather\.example\.test\/explore\/updates\/\d{4}\/\d{2}\/feed-forecast-update$/u;

const ALL_PUBLISH_KEYS = Object.values(PUBLISH_KEYS);

// Feed reads against real Postgres: the where clauses are not checked by the
// unit tests, which use a fake payload. Trial content lives in an isolated schema.
describe.skipIf(!testDatabaseUrl)("newsletter feed in Postgres", () => {
  let payload: Payload;
  let editor: User;
  const schema = `cms_feed_${randomUUID().replaceAll("-", "")}`;

  beforeAll(async () => {
    vi.stubEnv("PAYLOAD_SECRET", "integration-test-only-secret-at-least-32");
    vi.stubEnv(
      "DATABASE_URL",
      testDatabaseUrl ?? "postgresql://localhost/unused"
    );
    vi.stubEnv("CMS_URL", "http://localhost:3006");
    payload = await getPayload({
      config: buildConfig({
        secret: "integration-test-only-secret-at-least-32-characters",
        editor: lexicalEditor(),
        db: postgresAdapter({
          pool: { connectionString: testDatabaseUrl },
          schemaName: schema,
          push: true,
        }),
        collections: [
          DeskUpdates,
          Stories,
          ReportNotes,
          LivePosts,
          Media,
          Users,
          PublicationLog,
        ],
        admin: { user: "users", importMap: { autoGenerate: false } },
        graphQL: { disable: true },
        typescript: { autoGenerate: false },
      }),
    });
    editor = await payload.create({
      draft: true,
      collection: "users",
      overrideAccess: true,
      data: {
        email: "feed-editor@example.test",
        username: "feed-editor",
        fastapiUserId: "fastapi-feed-editor",
        role: "editor",
        permissionKeys: [
          "cms.article.create",
          "cms.article.edit.all",
          "cms.article.manage",
          ...ALL_PUBLISH_KEYS,
        ],
      },
    });
  }, 60_000);

  afterAll(async () => {
    if (payload) {
      await payload.db.drizzle.execute(
        sql.raw(`DROP SCHEMA "${schema}" CASCADE`)
      );
      await payload.destroy();
    }
    vi.unstubAllEnvs();
  });

  /** Create as a draft, then publish; `publishedAt` can be set to back-date it. */
  async function publishDesk(title: string, extra: Record<string, unknown>) {
    const created = await payload.create({
      collection: "desk-updates",
      user: editor,
      data: {
        title,
        kind: "forecasts",
        summary: `${title} summary`,
        status: "review",
        ...extra,
      } as never,
    });
    return payload.update({
      collection: "desk-updates",
      id: created.id,
      user: editor,
      data: { status: "published" } as never,
    });
  }

  it("feeds only ticked, published, recent posts, with absolute links", async () => {
    const now = new Date();
    const ticked = await publishDesk("Feed forecast update", {
      includeInNewsletter: true,
    });
    await publishDesk("Feed not ticked", { includeInNewsletter: false });
    await publishDesk("Feed old and ticked", {
      includeInNewsletter: true,
      publishedAt: new Date(now.getTime() - 5 * DAY).toISOString(),
    });
    await payload.create({
      collection: "desk-updates",
      user: editor,
      data: {
        title: "Feed ticked but in review",
        kind: "forecasts",
        summary: "stays in review",
        status: "review",
        includeInNewsletter: true,
      } as never,
    });
    await payload.create({
      collection: "live-posts",
      user: editor,
      data: {
        title: "Feed live update",
        kind: "update",
        text: "Showers from noon.",
        status: "review",
        includeInNewsletter: true,
      } as never,
    });
    const live = await payload.find({
      collection: "live-posts",
      overrideAccess: true,
      where: { title: { equals: "Feed live update" } },
    });
    const liveDoc = live.docs[0];
    if (!liveDoc) throw new Error("live post not created");
    await payload.update({
      collection: "live-posts",
      id: liveDoc.id,
      user: editor,
      data: { status: "published" } as never,
    });
    await payload.create({
      collection: "live-posts",
      user: editor,
      data: {
        title: "Feed note stays out",
        kind: "note",
        text: "Duty note.",
        expiresAt: new Date(now.getTime() + DAY).toISOString(),
        status: "review",
        includeInNewsletter: true,
      } as never,
    });

    const items = await findNewsletterItems(payload, { now, origin: ORIGIN });
    const titles = items.map((item) => item.title);

    expect(titles).toContain("Feed forecast update");
    expect(titles).toContain("Feed live update");
    expect(titles).not.toContain("Feed not ticked");
    expect(titles).not.toContain("Feed old and ticked");
    expect(titles).not.toContain("Feed ticked but in review");
    expect(titles).not.toContain("Feed note stays out");

    const forecast = items.find(
      (item) => item.title === "Feed forecast update"
    );
    expect(forecast).toMatchObject({
      summary: "Feed forecast update summary",
      includeInNewsletter: true,
    });
    expect(forecast?.url).toMatch(FORECAST_URL);
    expect(items.find((item) => item.title === "Feed live update")?.url).toBe(
      `${ORIGIN}/`
    );
    expect(ticked.status).toBe("published");
  });
});
