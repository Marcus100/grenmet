import { randomUUID } from "node:crypto";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres/drizzle";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig, getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DeskUpdates } from "./collections/desk-updates";
import { Media } from "./collections/media";
import { PublicationLog } from "./collections/publication-log";
import { Stories } from "./collections/stories";
import { Users } from "./collections/users";
import { testDatabaseUrl } from "./env";
import { readFastApiIdentity } from "./lib/fastapi-identity";
import { liveWhere } from "./lib/publication-window";
import type { DeskUpdate, User } from "./payload-types";

vi.mock("./lib/fastapi-identity", () => ({ readFastApiIdentity: vi.fn() }));

function body(text: string): NonNullable<DeskUpdate["body"]> {
  return {
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [
        {
          type: "paragraph",
          version: 1,
          direction: null,
          format: "",
          indent: 0,
          children: [
            {
              type: "text",
              version: 1,
              text,
              format: 0,
              detail: 0,
              mode: "normal",
              style: "",
            },
          ],
        },
      ],
    },
  };
}

const DESK_SLUG = /^updates\/\d{4}\/\d{2}\/preparing-for-the-season$/u;

// An isolated schema keeps trial content and all other databases untouched.
describe.skipIf(!testDatabaseUrl)("CMS editorial workflow in Postgres", () => {
  let payload: Payload;
  let editor: User;
  let author: User;
  const schema = `cms_test_${randomUUID().replaceAll("-", "")}`;
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
        collections: [DeskUpdates, Stories, Media, Users, PublicationLog],
        admin: { user: "users", importMap: { autoGenerate: false } },
        graphQL: { disable: true },
        typescript: { autoGenerate: false },
      }),
    });
    editor = await payload.create({
      draft: true,
      collection: "users",
      data: {
        email: "editor@example.test",
        username: "editor",
        fastapiUserId: "fastapi-editor",
        role: "editor",
        permissionKeys: [
          "cms.article.create",
          "cms.article.edit.all",
          "cms.article.manage",
          "cms.publish.desk-updates",
        ],
      },
    });
    author = await payload.create({
      draft: true,
      collection: "users",
      overrideAccess: true,
      data: {
        email: "author@example.test",
        username: "author",
        fastapiUserId: "fastapi-author",
        role: "author",
        permissionKeys: ["cms.article.create"],
      },
    });
  }, 30_000);
  afterAll(async () => {
    if (payload) {
      await payload.db.drizzle.execute(
        sql.raw(`DROP SCHEMA "${schema}" CASCADE`)
      );
      await payload.destroy();
    }
    vi.unstubAllEnvs();
  });
  it("mirrors one FastAPI identity and rejects revoked and cross-origin sessions", async () => {
    const identity = {
      fastapiUserId: "upstream-id",
      username: "original.name",
      email: "upstream@example.test",
      isSuperuser: false,
    };
    const upstream = vi.mocked(readFastApiIdentity).mockResolvedValue(identity);
    const headers = new Headers({
      cookie: "grenmet_session=valid",
      origin: "http://localhost:3006",
    });
    const first = await payload.auth({ headers });
    expect(first.user?.username).toBe("original.name");
    expect(first.user?.role).toBe("author");
    upstream.mockResolvedValue({ ...identity, username: "renamed.staff" });
    const renamed = await payload.auth({ headers });
    expect(renamed.user?.id).toBe(first.user?.id);
    expect(renamed.user?.username).toBe("renamed.staff");
    upstream.mockResolvedValue({
      ...identity,
      permissionKeys: ["cms.article.manage"],
    });
    expect((await payload.auth({ headers })).user?.role).toBe("editor");
    upstream.mockResolvedValue({
      ...identity,
      permissionKeys: ["cms.article.create"],
    });
    expect((await payload.auth({ headers })).user?.role).toBe("author");
    upstream.mockResolvedValue(null);
    expect((await payload.auth({ headers })).user).toBeNull();
    upstream.mockResolvedValue(identity);
    expect(
      (
        await payload.auth({
          headers: new Headers({
            cookie: "grenmet_session=valid",
            origin: "https://untrusted.test",
          }),
        })
      ).user
    ).toBeNull();
  });
  it("keeps designated editorial roles for mirrored staff", () => {
    expect(editor.role).toBe("editor");
    expect(author.role).toBe("author");
  });
  it("blocks public signup and author role escalation", async () => {
    await expect(
      payload.create({
        collection: "users",
        draft: true,
        overrideAccess: false,
        data: {
          email: "public@example.test",
          username: "public",
          fastapiUserId: "fastapi-public",
          role: "editor",
        },
      })
    ).rejects.toThrow();
    await expect(
      payload.update({
        collection: "users",
        id: author.id,
        overrideAccess: false,
        user: author,
        data: { role: "editor" },
      })
    ).rejects.toThrow();
    for (const data of [
      { fastapiUserId: "forged", username: "forged" },
      { role: "editor" as const },
      { permissionKeys: ["cms.article.manage"], isSuperuser: true },
    ]) {
      await expect(
        payload.update({
          collection: "users",
          id: author.id,
          overrideAccess: false,
          user: editor,
          data,
        })
      ).rejects.toThrow();
    }
  });
  it("keeps rich text private until a permitted editor publishes a reviewed article", async () => {
    const article = await payload.create({
      draft: true,
      collection: "desk-updates",
      overrideAccess: false,
      user: author,
      data: {
        title: "Preparing for the season",
        summary: "Check your supplies before the peak.",
        kind: "tropical-outlook",
        relatedLinks: [
          {
            title: "Read the outlook",
            category: "forecast",
            url: "https://weather.gd/forecasts",
          },
        ],
        body: body("Check supplies"),
        status: "draft",
        author: editor.id,
      },
    });
    expect(article.author).toMatchObject({ id: author.id });
    const publicDrafts = await payload.find({
      collection: "desk-updates",
      overrideAccess: false,
    });
    expect(publicDrafts.totalDocs).toBe(0);
    await expect(
      payload.update({
        collection: "desk-updates",
        id: article.id,
        overrideAccess: false,
        user: editor,
        data: { status: "published" },
      })
    ).rejects.toThrow("review");
    await payload.update({
      collection: "desk-updates",
      id: article.id,
      overrideAccess: false,
      user: author,
      data: { status: "review" },
    });
    await expect(
      payload.update({
        collection: "desk-updates",
        id: article.id,
        overrideAccess: false,
        user: author,
        data: { status: "published" },
      })
    ).rejects.toThrow("permission");
    await payload.update({
      collection: "desk-updates",
      id: article.id,
      overrideAccess: false,
      user: editor,
      data: { status: "published" },
    });
    const visible = await payload.find({
      collection: "desk-updates",
      overrideAccess: false,
    });
    expect(visible.totalDocs).toBe(1);
    expect(visible.docs[0]?.body).toEqual(body("Check supplies"));
    expect(visible.docs[0]?.kind).toBe("tropical-outlook");
    expect(visible.docs[0]?.slug).toMatch(DESK_SLUG);
    expect(visible.docs[0]?.relatedLinks?.[0]).toMatchObject({
      title: "Read the outlook",
      category: "forecast",
      url: "https://weather.gd/forecasts",
    });
    const history = await payload.findVersions({
      collection: "desk-updates",
      overrideAccess: false,
      user: editor,
      where: { parent: { equals: article.id } },
    });
    expect(history.docs[0]?.version.relatedLinks?.[0]?.url).toBe(
      "https://weather.gd/forecasts"
    );
    await expect(
      payload.update({
        collection: "desk-updates",
        id: article.id,
        overrideAccess: false,
        user: editor,
        data: {
          relatedLinks: [
            { title: "Unsafe", category: "source", url: "javascript:alert(1)" },
          ],
        },
      })
    ).rejects.toThrow("Paste a full HTTP or HTTPS address");
    await payload.update({
      collection: "desk-updates",
      id: article.id,
      overrideAccess: false,
      user: editor,
      data: { relatedLinks: [] },
    });
    expect(
      (
        await payload.findByID({
          collection: "desk-updates",
          id: article.id,
          overrideAccess: false,
        })
      ).relatedLinks ?? []
    ).toEqual([]);
    expect(visible.docs[0]?.author).toBeUndefined();
    await expect(
      payload.update({
        collection: "desk-updates",
        id: article.id,
        overrideAccess: false,
        user: author,
        data: { body: body("Bypass review") },
      })
    ).rejects.toThrow();
    await expect(
      payload.findVersions({
        collection: "desk-updates",
        overrideAccess: false,
      })
    ).rejects.toThrow();
  });
  it("prevents authors from editing each other's updates", async () => {
    const page = await payload.create({
      draft: true,
      collection: "desk-updates",
      overrideAccess: false,
      user: editor,
      data: {
        title: "About GMS",
        summary: "Who we are.",
        status: "draft",
        body: body("About GMS"),
        author: editor.id,
      },
    });
    await expect(
      payload.update({
        collection: "desk-updates",
        id: page.id,
        overrideAccess: false,
        user: author,
        data: { body: body("Changed") },
      })
    ).rejects.toThrow();
  });
  it("keeps each section's publish permission to its own collection", async () => {
    const image = await payload.create({
      collection: "media",
      overrideAccess: true,
      data: { alt: "Haze over Grand Anse", credit: "GMS" },
      file: {
        data: Buffer.from("R0lGODlhAQABAAAAACw=", "base64"),
        mimetype: "image/gif",
        name: "haze.gif",
        size: 14,
      },
    });
    const story = await payload.create({
      draft: true,
      collection: "stories",
      overrideAccess: false,
      user: author,
      data: {
        title: "Why the sky turns hazy",
        summary: "Saharan dust crosses the Atlantic.",
        kind: "explainer",
        image: image.id,
        body: body("Dust"),
        status: "review",
        slug: "pending",
        author: author.id,
      },
    });
    await expect(
      payload.update({
        collection: "stories",
        id: story.id,
        overrideAccess: false,
        user: editor,
        data: { status: "published" },
      })
    ).rejects.toThrow("permission");
  });
  it("holds a scheduled item back, takes an item off once its time passes, and records each change with its editor", async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const notice = (title: string) => ({
      title,
      summary: "Scheduled for the test.",
      kind: "service-notice" as const,
      body: body(title),
      author: author.id,
      relatedLinks: [
        {
          title: "Forecasts",
          category: "forecast" as const,
          url: "https://weather.gd/forecasts",
        },
      ],
    });
    const later = await payload.create({
      draft: true,
      collection: "desk-updates",
      overrideAccess: false,
      user: author,
      data: { ...notice("Shows tomorrow"), status: "review" },
    });
    const ended = await payload.create({
      draft: true,
      collection: "desk-updates",
      overrideAccess: false,
      user: author,
      data: { ...notice("Taken off yesterday"), status: "review" },
    });
    const shown = await payload.create({
      draft: true,
      collection: "desk-updates",
      overrideAccess: false,
      user: author,
      data: { ...notice("Shows now"), status: "review" },
    });
    await payload.update({
      collection: "desk-updates",
      id: later.id,
      overrideAccess: false,
      user: editor,
      data: { status: "published", publishAt: tomorrow },
    });
    await payload.update({
      collection: "desk-updates",
      id: ended.id,
      overrideAccess: false,
      user: editor,
      data: { status: "published", unpublishAt: yesterday },
    });
    await payload.update({
      collection: "desk-updates",
      id: shown.id,
      overrideAccess: false,
      user: editor,
      data: { status: "published" },
    });
    // What the public feed reads: only the item that is on the site now.
    const onSite = await payload.find({
      collection: "desk-updates",
      overrideAccess: false,
      where: liveWhere(new Date(), {
        title: { in: ["Shows tomorrow", "Taken off yesterday", "Shows now"] },
      }),
    });
    expect(onSite.docs.map((doc) => doc.title)).toEqual(["Shows now"]);
    // Taking the scheduled item down is a change in its own right.
    await payload.update({
      collection: "desk-updates",
      id: later.id,
      overrideAccess: false,
      user: editor,
      data: { status: "draft" },
    });
    const log = await payload.find({
      collection: "publication-log",
      overrideAccess: false,
      user: editor,
      depth: 0,
      sort: "createdAt",
      limit: 50,
      where: {
        documentId: {
          in: [later.id, ended.id, shown.id].map((id) => String(id)),
        },
      },
    });
    const rows = log.docs.map((row) => [row.title, row.action, row.actor]);
    expect(rows).toEqual([
      ["Shows tomorrow", "scheduled-publish", editor.id],
      ["Taken off yesterday", "published", editor.id],
      ["Shows now", "published", editor.id],
      ["Shows tomorrow", "unpublished", editor.id],
    ]);
  });
});
