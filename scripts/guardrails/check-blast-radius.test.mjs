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

const hiddenWebhook = `from fastapi import APIRouter
router = APIRouter(prefix="/webhooks")
def _verify_svix_signature(body):
    return False
@router.post("/resend", include_in_schema=False)
async def resend_webhook(request):
    return {}
`;

test("hidden webhook implementation fixes have no generated client counterpart", (t) => {
  const file = "apps/api/fastapi/src/webhooks/router.py";
  const { repository, base } = createRepository(t, { [file]: hiddenWebhook });
  write(
    repository,
    file,
    `import binascii\n${hiddenWebhook.replace("return False", "return True")}`
  );
  git(repository, "add", file);
  assert.equal(check(repository, ["--staged"]).status, 0);
  const head = commit(repository);
  assert.equal(check(repository, ["--base", base, "--head", head]).status, 0);
});

for (const [name, changed] of [
  [
    "schema exposure",
    hiddenWebhook.replace("include_in_schema=False", "include_in_schema=True"),
  ],
  ["path", hiddenWebhook.replace('"/resend"', '"/other"')],
  ["prefix", hiddenWebhook.replace('"/webhooks"', '"/changed"')],
  [
    "signature",
    hiddenWebhook.replace(
      "resend_webhook(request)",
      "resend_webhook(request, data)"
    ),
  ],
  [
    "new route",
    `${hiddenWebhook}\n@router.get("/public")\ndef extra():\n    return {}\n`,
  ],
  ["imports", `import unreviewed\n${hiddenWebhook}`],
]) {
  test(`hidden webhook ${name} changes still require contract companions`, (t) => {
    const file = "apps/api/fastapi/src/webhooks/router.py";
    const { repository } = createRepository(t, { [file]: hiddenWebhook });
    write(repository, file, changed);
    git(repository, "add", file);
    assert.equal(check(repository, ["--staged"]).status, 1);
  });
}

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

test("an OpenAPI title-only correction passes staged and range checks", (t) => {
  const file = "apps/api/fastapi/openapi.json";
  const before = {
    openapi: "3.1.0",
    info: { title: "HR verification" },
    paths: {},
  };
  const { base, repository } = createRepository(t, {
    [file]: JSON.stringify(before),
  });
  write(
    repository,
    file,
    JSON.stringify({ ...before, info: { title: "Barrels Grenada" } })
  );
  git(repository, "add", file);
  assert.equal(check(repository, ["--staged"]).status, 0);
  const head = commit(repository);
  assert.equal(check(repository, ["--base", base, "--head", head]).status, 0);
});

test("a title-only correction passes for an OpenAPI document over 1 MB", (t) => {
  // The real openapi.json outgrew spawnSync's default 1 MB output buffer.
  const file = "apps/api/fastapi/openapi.json";
  const before = {
    openapi: "3.1.0",
    info: { title: "HR verification" },
    paths: { "/large": { description: "x".repeat(2 * 1024 * 1024) } },
  };
  const { repository } = createRepository(t, {
    [file]: JSON.stringify(before),
  });
  write(
    repository,
    file,
    JSON.stringify({ ...before, info: { title: "Barrels Grenada" } })
  );
  git(repository, "add", file);
  assert.equal(check(repository, ["--staged"]).status, 0);
});

test("a title correction cannot hide an OpenAPI route change", (t) => {
  const file = "apps/api/fastapi/openapi.json";
  const { base, repository } = createRepository(t, {
    [file]: JSON.stringify({ info: { title: "HR verification" }, paths: {} }),
  });
  write(
    repository,
    file,
    JSON.stringify({
      info: { title: "Barrels Grenada" },
      paths: { "/new": {} },
    })
  );
  git(repository, "add", file);
  assert.equal(check(repository, ["--staged"]).status, 1);
  const head = commit(repository);
  assert.equal(check(repository, ["--base", base, "--head", head]).status, 1);
});

const DESCRIBED_MAIN = `app_configs: dict[str, Any] = {
    "title": settings.PROJECT_NAME,
    "description": (
        "Grenmet API for authenticated administration."
    ),
    "contact": {"name": "Grenmet API maintainers"},
}
app.include_router(api_router)
`;
const OPENAPI_INFO = {
  openapi: "3.1.0",
  info: {
    title: "Barrels Grenada",
    description: "Grenmet API for authenticated administration.",
    contact: { name: "Grenmet API maintainers" },
  },
  paths: { "/users": {} },
};
const redescribed = (source) =>
  source
    .replace(
      "Grenmet API for authenticated administration.",
      "The Barrels Grenada API for authenticated administration."
    )
    .replace("Grenmet API maintainers", "Barrels Grenada maintainers");

test("an API description and contact edit needs no client regeneration", (t) => {
  const main = "apps/api/fastapi/src/main.py";
  const schema = "apps/api/fastapi/openapi.json";
  const { base, repository } = createRepository(t, {
    [main]: DESCRIBED_MAIN,
    [schema]: JSON.stringify(OPENAPI_INFO),
  });
  write(repository, main, redescribed(DESCRIBED_MAIN));
  write(repository, schema, redescribed(JSON.stringify(OPENAPI_INFO)));
  git(repository, "add", main, schema);
  const staged = check(repository, ["--staged"]);
  assert.equal(staged.status, 0, staged.stderr);
  const head = commit(repository);
  const range = check(repository, ["--base", base, "--head", head]);
  assert.equal(range.status, 0, range.stderr);
});

test("a description edit cannot hide a router or schema change", (t) => {
  const main = "apps/api/fastapi/src/main.py";
  const schema = "apps/api/fastapi/openapi.json";
  const { base, repository } = createRepository(t, {
    [main]: DESCRIBED_MAIN,
    [schema]: JSON.stringify(OPENAPI_INFO),
  });
  write(
    repository,
    main,
    `${redescribed(DESCRIBED_MAIN)}app.include_router(new_router)\n`
  );
  write(
    repository,
    schema,
    redescribed(
      JSON.stringify({ ...OPENAPI_INFO, paths: { "/users": {}, "/new": {} } })
    )
  );
  const head = commit(repository);
  const result = check(repository, ["--base", base, "--head", head]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FastAPI contract companions/);
});

test("description metadata must stay a plain literal", (t) => {
  const main = "apps/api/fastapi/src/main.py";
  const { base, repository } = createRepository(t, { [main]: DESCRIBED_MAIN });
  write(
    repository,
    main,
    DESCRIBED_MAIN.replace(
      '{"name": "Grenmet API maintainers"}',
      "load_contact()"
    )
  );
  const head = commit(repository);
  assert.equal(check(repository, ["--base", base, "--head", head]).status, 1);
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

const WXPRODUCTS_ROUTER = `from src.dependencies import SessionDep

from .dependencies import AuthorDep, AuthoringSessionDep, WxProductsSessionDep

async def save_product(cap_session: SessionDep, body: ProductWrite) -> StoredProduct:
    pass
async def preview_product(cap_session: SessionDep, body: ProductPreviewInput) -> ProductPreview:
    pass
async def preview_product_pdf(cap_session: SessionDep, body: ProductPreviewInput) -> Response:
    pass
`;
const WXPRODUCTS_ISOLATED_ROUTER = `from .dependencies import (
    AdvisorySessionDep,
    AuthorDep,
    AuthoringSessionDep,
    WxProductsSessionDep,
)

async def save_product(cap_session: AdvisorySessionDep, body: ProductWrite) -> StoredProduct:
    pass
async def preview_product(cap_session: AdvisorySessionDep, body: ProductPreviewInput) -> ProductPreview:
    pass
async def preview_product_pdf(cap_session: AdvisorySessionDep, body: ProductPreviewInput) -> Response:
    pass
`;

test("the exact advisory session fix passes staged and CI range checks", (t) => {
  const file = "apps/api/fastapi/src/wxproducts/router.py";
  const { base, repository } = createRepository(t, {
    [file]: WXPRODUCTS_ROUTER,
  });
  write(repository, file, WXPRODUCTS_ISOLATED_ROUTER);
  git(repository, "add", file);
  const staged = check(repository, ["--staged"]);
  assert.equal(staged.status, 0, staged.stderr);
  const head = commit(repository);
  const range = check(repository, ["--base", base, "--head", head]);
  assert.equal(range.status, 0, range.stderr);
});

test("an advisory session fix with a response change still requires companions", (t) => {
  const file = "apps/api/fastapi/src/wxproducts/router.py";
  const { base, repository } = createRepository(t, {
    [file]: WXPRODUCTS_ROUTER,
  });
  write(
    repository,
    file,
    WXPRODUCTS_ISOLATED_ROUTER.replace("-> StoredProduct:", "-> NewProduct:")
  );
  git(repository, "add", file);
  const staged = check(repository, ["--staged"]);
  assert.equal(staged.status, 1);
  const head = commit(repository);
  const range = check(repository, ["--base", base, "--head", head]);
  assert.equal(range.status, 1);
  assert.match(range.stderr, /FastAPI contract companions/);
});

test("the advisory session fix does not exempt other router files", (t) => {
  const file = "apps/api/fastapi/src/wxproducts/router.py";
  const { base, repository } = createRepository(t, {
    [file]: WXPRODUCTS_ROUTER,
  });
  write(repository, file, WXPRODUCTS_ISOLATED_ROUTER);
  write(
    repository,
    "apps/api/fastapi/src/weather/router.py",
    "router = new_route\n"
  );
  const head = commit(repository);
  const result = check(repository, ["--base", base, "--head", head]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/weather\/router\.py/);
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

const REQUEST_LOGGING_BEFORE = `from src.audit.router import router as audit_router
async def request_logging_middleware(request: Request, call_next: Any) -> Any:
    start = time.perf_counter()
    response = await call_next(request)
    duration_s = time.perf_counter() - start
    logger.info(
        "%s %s %s %.3fs origin=%s cors_allow_origin=%s requested_headers=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_s,
        request.headers.get("origin", "-"),
        response.headers.get("access-control-allow-origin", "-"),
        request.headers.get("access-control-request-headers", "-"),
    )
    return response
`;
const REQUEST_LOGGING_AFTER = `from src import operational_metrics
from src.audit.router import router as audit_router
async def request_logging_middleware(request: Request, call_next: Any) -> Any:
    start = time.perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
    finally:
        duration_s = time.perf_counter() - start
        route = getattr(request.scope.get("route"), "path", "unmatched")
        logger.info(
            "request route=%s status=%s duration=%.3fs", route, status, duration_s
        )
        await operational_metrics.record_request(route, status, duration_s)
    return response
`;
for (const suffix of ["", "app.include_router(new_router)\n"]) {
  test(`request metrics exemption rejects additional route edits: ${Boolean(suffix)}`, (t) => {
    const file = "apps/api/fastapi/src/main.py";
    const { base, repository } = createRepository(t, {
      [file]: REQUEST_LOGGING_BEFORE,
    });
    write(repository, file, REQUEST_LOGGING_AFTER + suffix);
    git(repository, "add", file);
    assert.equal(check(repository, ["--staged"]).status, suffix ? 1 : 0);
    const head = commit(repository);
    assert.equal(
      check(repository, ["--base", base, "--head", head]).status,
      suffix ? 1 : 0
    );
  });
}
