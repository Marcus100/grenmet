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
  assert.match(result.stdout, /Blast-radius check passed/u);
});

test("a FastAPI contract change requires the committed OpenAPI document", (t) => {
  const { base, repository } = createRepository(t);
  write(repository, "apps/api/fastapi/src/weather/router.py");
  write(repository, "packages/api-client/src/gen/index.ts");
  write(repository, "docs/api/contracts.md");
  const head = commit(repository);

  const result = check(repository, ["--base", base, "--head", head]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /FastAPI contract companions/u);
  assert.match(result.stderr, /apps\/api\/fastapi\/src\/weather\/router\.py/u);
  assert.match(result.stderr, /apps\/api\/fastapi\/openapi\.json/u);
  assert.match(result.stderr, /Regenerate the committed OpenAPI document/u);
});

test("a FastAPI contract change requires generated API-client files", (t) => {
  const { base, repository } = createRepository(t);
  write(repository, "apps/api/fastapi/src/weather/schemas/request.py");
  write(repository, "apps/api/fastapi/openapi.json", "{}\n");
  write(repository, "docs/api/contracts.md");
  const head = commit(repository);

  const result = check(repository, ["--base", base, "--head", head]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /FastAPI contract companions/u);
  assert.match(
    result.stderr,
    /apps\/api\/fastapi\/src\/weather\/schemas\/request\.py/u
  );
  assert.match(result.stderr, /packages\/api-client\/src\/gen\//u);
  assert.match(result.stderr, /pnpm generate:api-client/u);
});

test("a FastAPI contract change requires API contract documentation", (t) => {
  const { base, repository } = createRepository(t);
  write(repository, "apps/api/fastapi/src/main.py");
  write(repository, "apps/api/fastapi/openapi.json", "{}\n");
  write(repository, "packages/api-client/src/gen/index.ts");
  const head = commit(repository);

  const result = check(repository, ["--base", base, "--head", head]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /FastAPI contract companions/u);
  assert.match(result.stderr, /apps\/api\/fastapi\/src\/main\.py/u);
  assert.match(result.stderr, /docs\/api\/contracts\.md/u);
  assert.match(result.stderr, /update the API contract documentation/u);
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
  assert.match(result.stdout, /Blast-radius check passed/u);
});

test("a committed OpenAPI change requires generated API-client files", (t) => {
  const { base, repository } = createRepository(t);
  write(repository, "apps/api/fastapi/openapi.json", "{}\n");
  const head = commit(repository);

  const result = check(repository, ["--base", base, "--head", head]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /OpenAPI-to-client sync/u);
  assert.match(result.stderr, /apps\/api\/fastapi\/openapi\.json/u);
  assert.match(result.stderr, /packages\/api-client\/src\/gen\//u);
  assert.match(result.stderr, /pnpm generate:api-client/u);
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

const PDF_SCHEMA = (headers, extra = {}) => ({
  openapi: "3.1.0",
  info: { title: "Barrels Grenada" },
  paths: {
    "/pdf": {
      get: {
        responses: {
          200: {
            description: "PDF",
            ...(headers ? { headers } : {}),
            ...extra,
          },
        },
      },
    },
  },
});

test("response header documentation needs no client regeneration", (t) => {
  const router = "apps/api/fastapi/src/hr/router.py";
  const openapi = "apps/api/fastapi/openapi.json";
  const { base, repository } = createRepository(t, {
    [openapi]: JSON.stringify(PDF_SCHEMA(null)),
    [router]: "old\n",
  });
  write(
    repository,
    openapi,
    JSON.stringify(PDF_SCHEMA({ "x-content-type-options": { schema: {} } }))
  );
  write(repository, router, "new\n");
  write(repository, "docs/api/contracts.md");
  git(repository, "add", "-A");
  assert.equal(check(repository, ["--staged"]).status, 0);
  const head = commit(repository);
  assert.equal(check(repository, ["--base", base, "--head", head]).status, 0);
});

test("a header documentation edit cannot hide a response change", (t) => {
  const router = "apps/api/fastapi/src/hr/router.py";
  const openapi = "apps/api/fastapi/openapi.json";
  const { base, repository } = createRepository(t, {
    [openapi]: JSON.stringify(PDF_SCHEMA(null)),
    [router]: "old\n",
  });
  write(
    repository,
    openapi,
    JSON.stringify(
      PDF_SCHEMA({ "x-content-type-options": { schema: {} } }, { content: {} })
    )
  );
  write(repository, router, "new\n");
  write(repository, "docs/api/contracts.md");
  git(repository, "add", "-A");
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
  assert.match(result.stderr, /FastAPI contract companions/u);
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
  assert.match(result.stderr, /FastAPI contract companions/u);
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
  assert.match(result.stderr, /FastAPI contract companions/u);
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
  assert.match(range.stderr, /FastAPI contract companions/u);
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
  assert.match(result.stderr, /src\/weather\/router\.py/u);
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
  assert.match(result.stderr, /FastAPI contract companions/u);
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

const REQUEST_ID_BEFORE = `from src.rate_limit import limiter
${REQUEST_LOGGING_AFTER.split("\n").slice(1).join("\n")}    app.add_middleware(
        CORSMiddleware,
        allow_headers=["Authorization", "Content-Type"],
    )
`;
const REQUEST_ID_AFTER = REQUEST_ID_BEFORE.replace(
  "from src.rate_limit import limiter\n",
  "from src.rate_limit import limiter\nfrom src.request_context import (\n    REQUEST_ID_HEADER,\n    bind_request_id,\n    reset_request_id,\n    resolve_request_id,\n)\n"
)
  .replace(
    "    try:\n        response = await call_next(request)\n        status = response.status_code\n    finally:",
    '    request_id = resolve_request_id(request.headers.get(REQUEST_ID_HEADER))\n    token = bind_request_id(request_id)\n    sentry_sdk.set_tag("request_id", request_id)\n    try:\n        response = await call_next(request)\n        status = response.status_code\n        response.headers[REQUEST_ID_HEADER] = request_id\n    finally:'
  )
  .replace(
    '        logger.info(\n            "request route=%s status=%s duration=%.3fs", route, status, duration_s\n        )\n        await operational_metrics.record_request(route, status, duration_s)\n',
    '        logger.info(\n            "request route=%s status=%s duration=%.3fs request_id=%s",\n            route,\n            status,\n            duration_s,\n            request_id,\n        )\n        await operational_metrics.record_request(route, status, duration_s)\n        reset_request_id(token)\n'
  )
  .replace(
    'allow_headers=["Authorization", "Content-Type"],\n    )',
    'allow_headers=["Authorization", "Content-Type"],\n        expose_headers=[REQUEST_ID_HEADER],\n    )'
  );
for (const suffix of ["", "app.include_router(new_router)\n"]) {
  test(`request ID exemption rejects additional route edits: ${Boolean(suffix)}`, (t) => {
    const file = "apps/api/fastapi/src/main.py";
    const { base, repository } = createRepository(t, {
      [file]: REQUEST_ID_BEFORE,
    });
    write(repository, file, REQUEST_ID_AFTER + suffix);
    git(repository, "add", file);
    assert.equal(check(repository, ["--staged"]).status, suffix ? 1 : 0);
    const head = commit(repository);
    assert.equal(
      check(repository, ["--base", base, "--head", head]).status,
      suffix ? 1 : 0
    );
  });
}

const LOGIN_ROUTER = `from src.rate_limit import limiter

def _request_metadata(request: Request) -> tuple[str | None, str | None]:
    user_agent = request.headers.get("user-agent")
    ip_address = request.client.host if request.client else None
    return user_agent, ip_address

async def login_session(request: Request, body: SessionLoginRequest) -> SessionResponse:
    pass
`;
const LOGIN_ROUTER_VISITOR_IP = LOGIN_ROUTER.replace(
  "from src.rate_limit import limiter\n",
  "from src.rate_limit import limiter, request_ip\n"
).replace(
  "    ip_address = request.client.host if request.client else None\n",
  "    ip_address = request_ip(request)\n"
);

test("the exact sign-in visitor address fix passes staged and CI range checks", (t) => {
  const file = "apps/api/fastapi/src/auth/routers/login.py";
  const { base, repository } = createRepository(t, { [file]: LOGIN_ROUTER });
  write(repository, file, LOGIN_ROUTER_VISITOR_IP);
  git(repository, "add", file);
  const staged = check(repository, ["--staged"]);
  assert.equal(staged.status, 0, staged.stderr);
  const head = commit(repository);
  const range = check(repository, ["--base", base, "--head", head]);
  assert.equal(range.status, 0, range.stderr);
});

test("the sign-in visitor address fix with a response change still requires companions", (t) => {
  const file = "apps/api/fastapi/src/auth/routers/login.py";
  const { repository } = createRepository(t, { [file]: LOGIN_ROUTER });
  write(
    repository,
    file,
    LOGIN_ROUTER_VISITOR_IP.replace("-> SessionResponse:", "-> NewSession:")
  );
  git(repository, "add", file);
  const staged = check(repository, ["--staged"]);
  assert.equal(staged.status, 1);
  assert.match(staged.stderr, /FastAPI contract companions/u);
});

const STARTUP_BEFORE = `from src import operational_metrics
from src.audit.router import router as audit_router
@asynccontextmanager
async def lifespan(_app):
    try:
        yield
    finally:
        await close_engine()
async def request_logging_middleware(request, call_next):
    return await call_next(request)
app = FastAPI(lifespan=lifespan)
app.add_middleware(BaseHTTPMiddleware, dispatch=request_logging_middleware)
app.include_router(audit_router, prefix="/api/v1")
def custom_openapi():
    return get_openapi(title="API", routes=app.routes)
app.openapi = custom_openapi
`;
const STARTUP_AFTER = STARTUP_BEFORE.replace(
  "from src import operational_metrics\n",
  "from src import database as main_database\nfrom src import operational_metrics\n"
)
  .replace(
    "        await close_engine()\n",
    "        await close_engine()\n        await main_database.async_engine.dispose()\n"
  )
  .replace(
    "async def request_logging_middleware(request, call_next):\n    return await call_next(request)\n",
    "class RequestLoggingMiddleware:\n    def __init__(self, app):\n        self.app = app\n    async def __call__(self, scope, receive, send):\n        await self.app(scope, receive, send)\n"
  )
  .replace(
    "app.add_middleware(BaseHTTPMiddleware, dispatch=request_logging_middleware)\n",
    "app.add_middleware(RequestLoggingMiddleware)\n"
  );
for (const [name, extra, expected] of [
  ["a lifespan and middleware rewrite passes", (source) => source, 0],
  [
    "a runtime edit plus a new router still requires companions",
    (source) => `${source}app.include_router(new_router)\n`,
    1,
  ],
  [
    "a runtime edit cannot hide an OpenAPI customisation",
    (source) => source.replace('title="API"', 'title="API v2"'),
    1,
  ],
  [
    "a runtime edit cannot hide a router prefix change",
    (source) => source.replace('prefix="/api/v1"', 'prefix="/api/v2"'),
    1,
  ],
]) {
  test(`runtime-only startup: ${name}`, (t) => {
    const file = "apps/api/fastapi/src/main.py";
    const { base, repository } = createRepository(t, {
      [file]: STARTUP_BEFORE,
    });
    write(repository, file, extra(STARTUP_AFTER));
    git(repository, "add", file);
    assert.equal(check(repository, ["--staged"]).status, expected);
    const head = commit(repository);
    assert.equal(
      check(repository, ["--base", base, "--head", head]).status,
      expected
    );
  });
}

const ROUTER = "apps/api/fastapi/src/cap/router.py";
const ROUTER_BEFORE = `from fastapi import APIRouter, Query
router = APIRouter()
@router.get("/alerts")
async def read_alerts(state: str | None = Query(default=None)):
    return []
`;
const ROUTER_AFTER = ROUTER_BEFORE.replace(
  "state: str | None = Query(default=None)",
  "state: Annotated[str | None, Query()] = None"
);
for (const [name, message, files, expected] of [
  [
    "a declared unchanged contract passes the range check",
    "refactor: annotated params\n\nAPI-Contract: unchanged\n",
    {},
    0,
  ],
  ["without the trailer the companions are still required", "refactor", {}, 1],
  [
    "the trailer is ignored when openapi.json itself changes",
    "refactor\n\nAPI-Contract: unchanged\n",
    { "apps/api/fastapi/openapi.json": '{"openapi":"3.1.0","paths":{}}\n' },
    1,
  ],
  [
    "the trailer must be a whole line",
    "refactor\n\nNot API-Contract: unchanged really\n",
    {},
    1,
  ],
]) {
  test(`declared contract: ${name}`, (t) => {
    const { base, repository } = createRepository(t, {
      [ROUTER]: ROUTER_BEFORE,
      "apps/api/fastapi/openapi.json": '{"openapi":"3.1.0"}\n',
    });
    write(repository, ROUTER, ROUTER_AFTER);
    for (const [file, contents] of Object.entries(files)) {
      write(repository, file, contents);
    }
    const head = commit(repository, message);
    assert.equal(
      check(repository, ["--base", base, "--head", head]).status,
      expected
    );
  });
}

test("declared contract: staged mode still requires companions", (t) => {
  const { repository } = createRepository(t, { [ROUTER]: ROUTER_BEFORE });
  write(repository, ROUTER, ROUTER_AFTER);
  git(repository, "add", ROUTER);
  assert.equal(check(repository, ["--staged"]).status, 1);
});

for (const [name, mutate] of [
  [
    "repointing a router alias",
    (source) =>
      source.replace(
        "from src.audit.router import router as audit_router",
        "from src.audit.router import public_router as audit_router"
      ),
  ],
  [
    "adding a route decorator to an exempt function",
    (source) =>
      source.replace(
        "class RequestLoggingMiddleware:",
        '@app.get("/x")\nclass RequestLoggingMiddleware:'
      ),
  ],
  [
    "an exempt function also used as a route dependency",
    (source) =>
      source.replace(
        'app.include_router(audit_router, prefix="/api/v1")',
        'app.include_router(audit_router, prefix="/api/v1", dependencies=[Depends(RequestLoggingMiddleware)])'
      ),
  ],
]) {
  test(`runtime-only startup cannot hide ${name}`, (t) => {
    const file = "apps/api/fastapi/src/main.py";
    const { base, repository } = createRepository(t, {
      [file]: STARTUP_BEFORE,
    });
    write(repository, file, mutate(STARTUP_AFTER));
    const head = commit(repository);
    assert.equal(check(repository, ["--base", base, "--head", head]).status, 1);
  });
}

test("declared contract: every commit touching routes needs the trailer", (t) => {
  const { base, repository } = createRepository(t, {
    [ROUTER]: ROUTER_BEFORE,
    "apps/api/fastapi/openapi.json": '{"openapi":"3.1.0"}\n',
  });
  write(repository, ROUTER, ROUTER_AFTER);
  commit(repository, "refactor\n\nAPI-Contract: unchanged\n");
  write(
    repository,
    ROUTER,
    `${ROUTER_AFTER}@router.get("/new")\nasync def new():\n    return []\n`
  );
  const head = commit(repository, "feat: add a route");
  assert.equal(check(repository, ["--base", base, "--head", head]).status, 1);
});

test("declared contract: a trailer on an unrelated commit does not count", (t) => {
  const { base, repository } = createRepository(t, {
    [ROUTER]: ROUTER_BEFORE,
    "apps/api/fastapi/openapi.json": '{"openapi":"3.1.0"}\n',
  });
  write(repository, ROUTER, ROUTER_AFTER);
  commit(repository, "refactor");
  write(repository, "README.md", "notes\n");
  const head = commit(repository, "docs\n\nAPI-Contract: unchanged\n");
  assert.equal(check(repository, ["--base", base, "--head", head]).status, 1);
});
