import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseUrl } from "../env";
import { migrations } from "./index";

/** The part of `pg` this test uses; the workspace has no `@types/pg` installed. */
interface ScratchClient {
  connect: () => Promise<void>;
  end: () => Promise<void>;
  query: <Row = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ) => Promise<{ rows: Row[] }>;
}
const { Client } = createRequire(import.meta.url)("pg") as {
  Client: new (config: { connectionString: string }) => ScratchClient;
};

const TARGET = "20261029_023326_publication_log_and_scheduling";

/**
 * Runs the migrations' own `up`/`down` functions against a plain connection.
 * They only call `db.execute(sql`...`)`; the Drizzle SQL object is rendered to
 * text here (the migrations pass no parameters).
 */
function executor(client: ScratchClient) {
  return {
    execute: (query: unknown) => {
      const rendered = (
        query as {
          toQuery: (config: {
            escapeName: (name: string) => string;
            escapeParam: (index: number) => string;
            escapeString: (value: string) => string;
          }) => { params: unknown[]; sql: string };
        }
      ).toQuery({
        escapeName: (name) => `"${name}"`,
        escapeParam: (index) => `$${index + 1}`,
        escapeString: (value) => `'${value.replaceAll("'", "''")}'`,
      });
      return rendered.params.length > 0
        ? client.query(rendered.sql, rendered.params)
        : client.query(rendered.sql);
    },
  };
}

type Args = Parameters<(typeof migrations)[number]["up"]>[0];
const asArgs = (client: ScratchClient): Args =>
  ({ db: executor(client) }) as unknown as Args;

function migrationNamed(name: string) {
  const found = migrations.find((migration) => migration.name === name);
  if (!found) throw new Error(`no migration ${name}`);
  return found;
}

// Only a scratch database (name starts with cms_scratch_) is ever reset. The
// shared gms_cms database is refused, so this test cannot touch live content.
describe.skipIf(!testDatabaseUrl)(
  "publication log migration rolls back on a scratch database",
  () => {
    let client: ScratchClient;

    beforeAll(async () => {
      if (!testDatabaseUrl)
        throw new Error("CMS_TEST_DATABASE_URL is required");
      const name = decodeURIComponent(
        new URL(testDatabaseUrl).pathname.slice(1)
      );
      if (!name.startsWith("cms_scratch_"))
        throw new Error(`refusing to reset database "${name}"`);
      client = new Client({ connectionString: testDatabaseUrl });
      await client.connect();
      await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    });

    afterAll(async () => {
      await client?.end();
    });

    it("converts duty notes to updates before rebuilding the kind enum", async () => {
      const index = migrations.findIndex(
        (migration) => migration.name === TARGET
      );
      for (const migration of migrations.slice(0, index)) {
        await migration.up(asArgs(client));
      }
      const target = migrationNamed(TARGET);
      await target.up(asArgs(client));

      const { rows: author } = await client.query<{ id: number }>(
        "INSERT INTO users (fastapi_user_id, username, email) VALUES ('fa-scratch', 'editor', 'editor@example.test') RETURNING id"
      );
      const authorId = author[0]?.id ?? null;
      await client.query(
        `INSERT INTO live_posts (title, slug, kind, author_id) VALUES ('Duty note', 'duty-note', 'note', $1),
           ('Rain update', 'rain-update', 'update', $1)`,
        [authorId]
      );
      await client.query(
        `INSERT INTO _live_posts_v (parent_id, version_title, version_kind, version_slug, version_author_id)
         VALUES (1, 'Duty note', 'note', 'duty-note', $1)`,
        [authorId]
      );

      await expect(target.down(asArgs(client))).resolves.toBeUndefined();

      const { rows: kinds } = await client.query<{ kind: string }>(
        "SELECT kind::text AS kind FROM live_posts ORDER BY slug"
      );
      expect(kinds.map((row) => row.kind)).toEqual(["update", "update"]);
      const { rows: versions } = await client.query<{ kind: string }>(
        "SELECT version_kind::text AS kind FROM _live_posts_v"
      );
      expect(versions.map((row) => row.kind)).toEqual(["update"]);
      const { rows: values } = await client.query<{ value: string }>(
        "SELECT unnest(enum_range(NULL::enum_live_posts_kind))::text AS value"
      );
      expect(values.map((row) => row.value)).not.toContain("note");
      const { rows: log } = await client.query<{ present: string | null }>(
        "SELECT to_regclass('public.publication_log')::text AS present"
      );
      expect(log[0]?.present).toBeNull();
    });

    it("re-applies cleanly after the rollback", async () => {
      await migrationNamed(TARGET).up(asArgs(client));
      const { rows } = await client.query<{ value: string }>(
        "SELECT unnest(enum_range(NULL::enum_live_posts_kind))::text AS value"
      );
      expect(rows.map((row) => row.value)).toContain("note");
    });
  }
);
