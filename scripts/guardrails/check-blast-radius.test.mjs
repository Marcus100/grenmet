/* biome-ignore-all lint/performance/useTopLevelRegex: Diagnostic regexes run once per isolated CLI integration test. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(
  new URL("./check-blast-radius.mjs", import.meta.url)
);

const run = (command, args, options = {}) =>
  spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
  });

const git = (repository, ...args) => {
  const result = run("git", args, { cwd: repository });
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed:\n${result.stderr}`
  );
  return result.stdout.trim();
};

const write = (repository, file, contents = `${file}\n`) => {
  const destination = join(repository, file);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
};

const createRepository = (t, files = { "README.md": "initial\n" }) => {
  const repository = mkdtempSync(join(tmpdir(), "grenmet-guardrails-"));
  t.after(() => rmSync(repository, { recursive: true, force: true }));

  git(repository, "init", "--quiet", "--initial-branch=main");
  git(repository, "config", "user.email", "guardrails@example.com");
  git(repository, "config", "user.name", "Repository Guardrails");
  for (const [file, contents] of Object.entries(files)) {
    write(repository, file, contents);
  }
  git(repository, "add", ".");
  git(repository, "commit", "--quiet", "-m", "initial");

  return {
    base: git(repository, "rev-parse", "HEAD"),
    repository,
  };
};

const commit = (repository, message = "change") => {
  git(repository, "add", "-A");
  git(repository, "commit", "--quiet", "-m", message);
  return git(repository, "rev-parse", "HEAD");
};

const check = (repository, args, env) =>
  run(process.execPath, [cliPath, ...args], { cwd: repository, env });

test("an unrelated Git range passes", (t) => {
  const { base, repository } = createRepository(t);
  write(repository, "README.md", "updated\n");
  const head = commit(repository);

  const result = check(repository, ["--base", base, "--head", head]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Blast-radius check passed/);
});

test("a FastAPI contract change requires the committed OpenAPI document", (t) => {
  const { base, repository } = createRepository(t);
  write(repository, "apps/api/fastapi/src/weather/router.py");
  write(repository, "packages/api-client/src/gen/index.ts");
  write(repository, "docs/api/contracts.md");
  const head = commit(repository);

  const result = check(repository, ["--base", base, "--head", head]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /FastAPI contract companions/);
  assert.match(result.stderr, /apps\/api\/fastapi\/src\/weather\/router\.py/);
  assert.match(result.stderr, /apps\/api\/fastapi\/openapi\.json/);
  assert.match(result.stderr, /Regenerate the committed OpenAPI document/);
});

test("a FastAPI contract change requires generated API-client files", (t) => {
  const { base, repository } = createRepository(t);
  write(repository, "apps/api/fastapi/src/weather/schemas/request.py");
  write(repository, "apps/api/fastapi/openapi.json", "{}\n");
  write(repository, "docs/api/contracts.md");
  const head = commit(repository);

  const result = check(repository, ["--base", base, "--head", head]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /FastAPI contract companions/);
  assert.match(
    result.stderr,
    /apps\/api\/fastapi\/src\/weather\/schemas\/request\.py/
  );
  assert.match(result.stderr, /packages\/api-client\/src\/gen\//);
  assert.match(result.stderr, /pnpm generate:api-client/);
});

test("a FastAPI contract change requires API contract documentation", (t) => {
  const { base, repository } = createRepository(t);
  write(repository, "apps/api/fastapi/src/main.py");
  write(repository, "apps/api/fastapi/openapi.json", "{}\n");
  write(repository, "packages/api-client/src/gen/index.ts");
  const head = commit(repository);

  const result = check(repository, ["--base", base, "--head", head]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /FastAPI contract companions/);
  assert.match(result.stderr, /apps\/api\/fastapi\/src\/main\.py/);
  assert.match(result.stderr, /docs\/api\/contracts\.md/);
  assert.match(result.stderr, /update the API contract documentation/);
});

test("a complete FastAPI contract change passes", (t) => {
  const { base, repository } = createRepository(t);
  write(repository, "apps/api/fastapi/src/weather/routers/forecast.py");
  write(repository, "apps/api/fastapi/openapi.json", "{}\n");
  write(repository, "packages/api-client/src/gen/index.ts");
  write(repository, "docs/api/contracts.md");
  const head = commit(repository);

  const result = check(repository, ["--base", base, "--head", head]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Blast-radius check passed/);
});

test("a committed OpenAPI change requires generated API-client files", (t) => {
  const { base, repository } = createRepository(t);
  write(repository, "apps/api/fastapi/openapi.json", "{}\n");
  const head = commit(repository);

  const result = check(repository, ["--base", base, "--head", head]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /OpenAPI-to-client sync/);
  assert.match(result.stderr, /apps\/api\/fastapi\/openapi\.json/);
  assert.match(result.stderr, /packages\/api-client\/src\/gen\//);
  assert.match(result.stderr, /pnpm generate:api-client/);
});

const drizzleSchemaFamilies = {
  janitorial: "apps/web/admin-gms/src/db/janitorial/schema.ts",
  transport: "apps/web/admin-gms/src/db/transport/schema.ts",
  wxproducts: "apps/web/admin-gms/src/db/wxproducts/schema/index.ts",
  wxwatch: "apps/web/admin-gms/src/db/wxwatch/schema.ts",
};

for (const [family, schemaFile] of Object.entries(drizzleSchemaFamilies)) {
  test(`the ${family} Drizzle schema requires a matching migration`, (t) => {
    const { base, repository } = createRepository(t);
    write(repository, schemaFile);
    write(
      repository,
      "apps/web/admin-gms/drizzle/unrelated/0001_unrelated.sql"
    );
    let head = commit(repository, `change ${family} schema`);

    let result = check(repository, ["--base", base, "--head", head]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`Drizzle ${family} migration`));
    assert.match(result.stderr, new RegExp(schemaFile.replaceAll("/", "\\/")));
    assert.match(
      result.stderr,
      new RegExp(`apps/web/admin-gms/drizzle/${family}/`)
    );

    write(repository, `apps/web/admin-gms/drizzle/${family}/0001_schema.sql`);
    head = commit(repository, `add ${family} migration`);
    result = check(repository, ["--base", base, "--head", head]);

    assert.equal(result.status, 0, result.stderr);
  });
}

test("deleting a protected file counts as a change", (t) => {
  const router = "apps/api/fastapi/src/weather/router.py";
  const { base, repository } = createRepository(t, {
    [router]: "router = None\n",
  });
  rmSync(join(repository, router));
  const head = commit(repository, "delete router");

  const result = check(repository, ["--base", base, "--head", head]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /apps\/api\/fastapi\/src\/weather\/router\.py/);
  assert.match(result.stderr, /apps\/api\/fastapi\/openapi\.json/);
});

test("renaming a protected file counts both paths as changes", (t) => {
  const router = "apps/api/fastapi/src/weather/router.py";
  const { base, repository } = createRepository(t, {
    [router]: "router = None\n",
  });
  git(
    repository,
    "mv",
    router,
    "apps/api/fastapi/src/weather/implementation.py"
  );
  const head = commit(repository, "rename router");

  const result = check(repository, ["--base", base, "--head", head]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /apps\/api\/fastapi\/src\/weather\/router\.py/);
  assert.match(result.stderr, /apps\/api\/fastapi\/openapi\.json/);
});

test("a malformed comparison fails with usage guidance", (t) => {
  const { repository } = createRepository(t);

  const result = check(repository, ["--base", "HEAD"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /choose exactly one comparison mode/);
  assert.match(result.stderr, /--staged \| --base <sha> --head <sha>/);
});

test("an unavailable Git range fails with recovery guidance", (t) => {
  const { repository } = createRepository(t);

  const result = check(repository, [
    "--base",
    "missing-base",
    "--head",
    "HEAD",
  ]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Git could not compare/);
  assert.match(result.stderr, /Fetch the base and head commits/);
  assert.doesNotMatch(result.stdout, /Blast-radius check passed/);
});

test("the blast-radius bypass applies only to staged local checks", (t) => {
  const { base, repository } = createRepository(t);
  write(repository, "apps/api/fastapi/src/weather/router.py");
  git(repository, "add", ".");

  let result = check(repository, ["--staged"], {
    SKIP_BLAST_RADIUS: "0",
  });
  assert.equal(result.status, 1);

  result = check(repository, ["--staged"], {
    SKIP_BLAST_RADIUS: "1",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /staged blast-radius check skipped/);

  const head = commit(repository, "partial contract change");
  result = check(repository, ["--base", base, "--head", head], {
    SKIP_BLAST_RADIUS: "1",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FastAPI contract companions/);
});

test("auth and shared UI changes explain required consumer validation", (t) => {
  const { base, repository } = createRepository(t);
  write(repository, "packages/auth/src/session.ts");
  write(repository, "packages/ui/src/components/button.tsx");
  const head = commit(repository);

  const result = check(repository, ["--base", base, "--head", head]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Auth consumer validation required/);
  assert.match(
    result.stdout,
    /auth, admin-gms, hurricaneplan, spicewx, signal/
  );
  assert.match(result.stdout, /AUTH_API_URL/);
  assert.match(result.stdout, /Shared UI consumer validation required/);
  assert.match(result.stdout, /every importing app/);
  assert.match(result.stdout, /pnpm type-check, pnpm test, and pnpm build/);
});

test("admin routes and Drizzle schemas explain cross-cutting validation", (t) => {
  const { base, repository } = createRepository(t);
  write(repository, "apps/web/admin-gms/src/app/(admin)/hr/page.tsx");
  write(repository, "apps/web/admin-gms/src/db/wxwatch/schema.ts");
  write(repository, "apps/web/admin-gms/drizzle/wxwatch/0001_schema.sql");
  const head = commit(repository);

  const result = check(repository, ["--base", base, "--head", head]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Admin route validation required/);
  assert.match(result.stdout, /cap, hr, wxwatch, wxproducts, and salesbus/);
  assert.match(result.stdout, /Drizzle production validation required/);
  assert.match(result.stdout, /web-migrate production service/);
  assert.match(result.stdout, /wxwatch and wxproducts databases/);
});
