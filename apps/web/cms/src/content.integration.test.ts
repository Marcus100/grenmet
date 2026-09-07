import { randomUUID } from "node:crypto";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres/drizzle";
import { buildConfig, getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Content } from "./collections/content";
import { Users } from "./collections/users";
import { testDatabaseUrl } from "./env";
import { readFastApiIdentity } from "./lib/fastapi-identity";
import type { User } from "./payload-types";

vi.mock("./lib/fastapi-identity", () => ({ readFastApiIdentity: vi.fn() }));

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
        db: postgresAdapter({
          pool: { connectionString: testDatabaseUrl },
          schemaName: schema,
          push: true,
        }),
        collections: [Users, Content],
        admin: { user: "users", importMap: { autoGenerate: false } },
        graphQL: { disable: true },
        typescript: { autoGenerate: false },
      }),
    });
    editor = await payload.create({
      collection: "users",
      data: {
        email: "editor@example.test",
        username: "editor",
        fastapiUserId: "fastapi-editor",
        role: "editor",
      },
    });
    author = await payload.create({
      collection: "users",
      overrideAccess: true,
      data: {
        email: "author@example.test",
        username: "author",
        fastapiUserId: "fastapi-author",
        role: "author",
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
  it("keeps Markdown private until an editor publishes a reviewed article", async () => {
    const article = await payload.create({
      collection: "content",
      overrideAccess: false,
      user: author,
      data: {
        title: "Preparing for the season",
        slug: "season-preparation",
        kind: "article",
        body: "# Prepare\n\n- Check supplies",
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
    ).rejects.toThrow("editor");
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
    expect(visible.docs[0]?.body).toBe("# Prepare\n\n- Check supplies");
    expect(visible.docs[0]?.author).toBeUndefined();
    await expect(
      payload.update({
        collection: "content",
        id: article.id,
        overrideAccess: false,
        user: author,
        data: { body: "Bypass review" },
      })
    ).rejects.toThrow();
    await expect(
      payload.findVersions({ collection: "content", overrideAccess: false })
    ).rejects.toThrow();
  });
  it("prevents authors from editing each other and allows general pages", async () => {
    const page = await payload.create({
      collection: "content",
      overrideAccess: false,
      user: editor,
      data: {
        title: "About GMS",
        slug: "about-gms",
        kind: "page",
        status: "draft",
        body: "About **GMS**",
        author: editor.id,
      },
    });
    await expect(
      payload.update({
        collection: "content",
        id: page.id,
        overrideAccess: false,
        user: author,
        data: { body: "Changed" },
      })
    ).rejects.toThrow();
  });
});
