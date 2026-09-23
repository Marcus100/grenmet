import { randomUUID } from "node:crypto";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres/drizzle";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig, createLocalReq, getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Content } from "./collections/content";
import { Media } from "./collections/media";
import { Users } from "./collections/users";
import { testDatabaseUrl } from "./env";
import { readFastApiIdentity } from "./lib/fastapi-identity";
import { up as migrateEditorialLinks } from "./migrations/20260923_170000_editorial_links";
import type { Content as ContentDocument, User } from "./payload-types";

vi.mock("./lib/fastapi-identity", () => ({ readFastApiIdentity: vi.fn() }));

function body(text: string): ContentDocument["body"] {
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
        collections: [Users, Content, Media],
        admin: { user: "users", importMap: { autoGenerate: false } },
        graphQL: { disable: true },
        typescript: { autoGenerate: false },
      }),
    });
    // Replace auto-pushed link tables with the actual additive migration, then
    // exercise Payload writes and history against its physical schema.
    const req = await createLocalReq({}, payload);
    await payload.db.drizzle.transaction(async (db) => {
      await db.execute(
        sql.raw(
          `SET LOCAL search_path TO "${schema}"; DROP TABLE "${schema}"."content_related_links"; DROP TABLE "${schema}"."_content_v_version_related_links"; DROP TYPE "${schema}"."enum_content_related_links_category"; DROP TYPE "${schema}"."enum__content_v_version_related_links_category";`
        )
      );
      await migrateEditorialLinks({ db, payload, req });
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
          "cms.article.publish.latest-from-us",
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
    const unchanged = await payload.update({
      collection: "users",
      id: author.id,
      overrideAccess: false,
      user: editor,
      data: { fastapiUserId: "forged", username: "forged" },
    });
    expect(unchanged.fastapiUserId).toBe("fastapi-author");
    expect(unchanged.username).toBe("author");
  });
  it("keeps rich text private until a permitted editor publishes a reviewed article", async () => {
    const article = await payload.create({
      draft: true,
      collection: "content",
      overrideAccess: false,
      user: author,
      data: {
        title: "Preparing for the season",
        updateType: "Tropical weather outlook",
        relatedLinks: [
          {
            title: "Read the outlook",
            category: "forecast",
            url: "https://weather.gd/forecasts",
          },
        ],
        slug: "season-preparation",
        body: body("Check supplies"),
        status: "draft",
        author: editor.id,
      },
    });
    expect(article.author).toMatchObject({ id: author.id });
    const publicDrafts = await payload.find({
      collection: "content",
      overrideAccess: false,
    });
    expect(publicDrafts.totalDocs).toBe(0);
    await expect(
      payload.update({
        collection: "content",
        id: article.id,
        overrideAccess: false,
        user: editor,
        data: { status: "published" },
      })
    ).rejects.toThrow("review");
    await payload.update({
      collection: "content",
      id: article.id,
      overrideAccess: false,
      user: author,
      data: { status: "review" },
    });
    await expect(
      payload.update({
        collection: "content",
        id: article.id,
        overrideAccess: false,
        user: author,
        data: { status: "published" },
      })
    ).rejects.toThrow("permission");
    await payload.update({
      collection: "content",
      id: article.id,
      overrideAccess: false,
      user: editor,
      data: { status: "published" },
    });
    const visible = await payload.find({
      collection: "content",
      overrideAccess: false,
    });
    expect(visible.totalDocs).toBe(1);
    expect(visible.docs[0]?.body).toEqual(body("Check supplies"));
    expect(visible.docs[0]?.updateType).toBe("Tropical weather outlook");
    expect(visible.docs[0]?.relatedLinks?.[0]).toMatchObject({
      title: "Read the outlook",
      category: "forecast",
      url: "https://weather.gd/forecasts",
    });
    const history = await payload.findVersions({
      collection: "content",
      overrideAccess: false,
      user: editor,
      where: { parent: { equals: article.id } },
    });
    expect(history.docs[0]?.version.relatedLinks?.[0]?.url).toBe(
      "https://weather.gd/forecasts"
    );
    await expect(
      payload.update({
        collection: "content",
        id: article.id,
        overrideAccess: false,
        user: editor,
        data: {
          relatedLinks: [
            { title: "Unsafe", category: "source", url: "javascript:alert(1)" },
          ],
        },
      })
    ).rejects.toThrow("Related links");
    await payload.update({
      collection: "content",
      id: article.id,
      overrideAccess: false,
      user: editor,
      data: { relatedLinks: [] },
    });
    expect(
      (
        await payload.findByID({
          collection: "content",
          id: article.id,
          overrideAccess: false,
        })
      ).relatedLinks ?? []
    ).toEqual([]);
    expect(visible.docs[0]?.author).toBeUndefined();
    await expect(
      payload.update({
        collection: "content",
        id: article.id,
        overrideAccess: false,
        user: author,
        data: { body: body("Bypass review") },
      })
    ).rejects.toThrow();
    await expect(
      payload.findVersions({ collection: "content", overrideAccess: false })
    ).rejects.toThrow();
  });
  it("prevents authors from editing each other and allows general pages", async () => {
    const page = await payload.create({
      draft: true,
      collection: "content",
      overrideAccess: false,
      user: editor,
      data: {
        title: "About GMS",
        slug: "about-gms",
        status: "draft",
        body: body("About GMS"),
        author: editor.id,
      },
    });
    await expect(
      payload.update({
        collection: "content",
        id: page.id,
        overrideAccess: false,
        user: author,
        data: { body: body("Changed") },
      })
    ).rejects.toThrow();
  });
});
