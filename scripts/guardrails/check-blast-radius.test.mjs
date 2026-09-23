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
  t.after(() => rmSync(repository, { force: true, recursive: true }));

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

const TELEMETRY_MAIN =
  "from src.utils.router import router as utils_router\nif settings.SENTRY_DSN:\n    sentry_sdk.init(\n        enable_tracing=True,\n    )\n";
const withTelemetry = (source) =>
  source
    .replace(
      "from src.utils.router import router as utils_router",
      "from src.telemetry import sentry_options\nfrom src.utils.router import router as utils_router"
    )
    .replace("        enable_tracing=True,", "        **sentry_options(),");

test("the exact telemetry-only startup edit passes staged and CI range checks", (t) => {
  const file = "apps/api/fastapi/src/main.py";
  const { base, repository } = createRepository(t, { [file]: TELEMETRY_MAIN });
  write(repository, file, withTelemetry(TELEMETRY_MAIN));
  git(repository, "add", file);
  const staged = check(repository, ["--staged"]);
  assert.equal(staged.status, 0, staged.stderr);
  const head = commit(repository);
  const range = check(repository, ["--base", base, "--head", head]);
  assert.equal(range.status, 0, range.stderr);
});

test("telemetry plus a route edit still requires contract companions", (t) => {
  const file = "apps/api/fastapi/src/main.py";
  const { base, repository } = createRepository(t, { [file]: TELEMETRY_MAIN });
  write(
    repository,
    file,
    `${withTelemetry(TELEMETRY_MAIN)}app.include_router(new_router)\n`
  );
  const head = commit(repository);
  const result = check(repository, ["--base", base, "--head", head]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FastAPI contract companions/);
});

test("telemetry does not exempt other router files", (t) => {
  const file = "apps/api/fastapi/src/main.py";
  const { base, repository } = createRepository(t, { [file]: TELEMETRY_MAIN });
  write(repository, file, withTelemetry(TELEMETRY_MAIN));
  write(
    repository,
    "apps/api/fastapi/src/weather/router.py",
    "router = new_route\n"
  );
  const head = commit(repository);
  const result = check(repository, ["--base", base, "--head", head]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FastAPI contract companions/);
});

const JANITORIAL_ROUTER =
  "async def spec():\n    query = '''\n        LEFT JOIN sections s ON s.building_id=b.id\n    '''\n";
const withUnsectionedAreas = (source) =>
  source.replace(
    "        LEFT JOIN sections s ON s.building_id=b.id",
    `        LEFT JOIN (
            SELECT id, building_id, name, sort_order FROM sections
            UNION ALL
            -- Areas without a section form their own group, even in buildings
            -- that also have sections.
            SELECT DISTINCT NULL::integer, building_id, NULL::text, NULL::integer
            FROM areas WHERE section_id IS NULL
        ) s ON s.building_id=b.id`
  );

test("the exact janitorial query fix passes staged and CI range checks", (t) => {
  const file = "apps/api/fastapi/src/janitorial/router.py";
  const { base, repository } = createRepository(t, {
    [file]: JANITORIAL_ROUTER,
  });
  write(repository, file, withUnsectionedAreas(JANITORIAL_ROUTER));
  git(repository, "add", file);
  const staged = check(repository, ["--staged"]);
  assert.equal(staged.status, 0, staged.stderr);
  const head = commit(repository);
  const range = check(repository, ["--base", base, "--head", head]);
  assert.equal(range.status, 0, range.stderr);
});

test("another janitorial route edit still requires contract companions", (t) => {
  const file = "apps/api/fastapi/src/janitorial/router.py";
  const { base, repository } = createRepository(t, {
    [file]: JANITORIAL_ROUTER,
  });
  write(
    repository,
    file,
    `${withUnsectionedAreas(JANITORIAL_ROUTER)}router = new_route\n`
  );
  const head = commit(repository);
  const result = check(repository, ["--base", base, "--head", head]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FastAPI contract companions/);
});
