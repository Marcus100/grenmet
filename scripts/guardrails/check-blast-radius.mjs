#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const usage =
  "Usage: node scripts/guardrails/check-blast-radius.mjs --staged | --base <sha> --head <sha>";

const fail = (message) => {
  console.error(`Blast-radius check could not run: ${message}\n${usage}`);
  process.exitCode = 2;
};

const parseArguments = (args) => {
  if (args.length === 1 && args[0] === "--staged") {
    return { mode: "staged" };
  }
  if (
    args.length === 4 &&
    args[0] === "--base" &&
    args[1] &&
    args[2] === "--head" &&
    args[3]
  ) {
    return { base: args[1], head: args[3], mode: "range" };
  }
};

const parseChanges = (output) => {
  const tokens = output.split("\0");
  const changes = [];

  for (let index = 0; index < tokens.length - 1; ) {
    const status = tokens[index++];
    const firstPath = tokens[index++];
    if (!(status && firstPath)) {
      throw new Error("Git returned an invalid name-status record.");
    }

    if (status.startsWith("R") || status.startsWith("C")) {
      const secondPath = tokens[index++];
      if (!secondPath) {
        throw new Error("Git returned an incomplete rename or copy record.");
      }
      changes.push({ paths: [firstPath, secondPath], status });
    } else {
      changes.push({ paths: [firstPath], status });
    }
  }

  return changes;
};

const fastApiContractFilePattern =
  /^apps\/api\/fastapi\/src\/(?:.+\/)?(?:router|routes|schemas?)\.py$/;
const fastApiContractDirectoryFilePattern =
  /^apps\/api\/fastapi\/src\/(?:.+\/)?(?:routers|schemas?)\/.*\.py$/;

const isFastApiContractFile = (file) =>
  file === "apps/api/fastapi/src/main.py" ||
  fastApiContractFilePattern.test(file) ||
  fastApiContractDirectoryFilePattern.test(file);

const collectChanges = (comparison) => {
  const range =
    comparison.mode === "staged"
      ? ["--cached"]
      : [comparison.base, comparison.head];
  const result = spawnSync(
    "git",
    ["diff", "--name-status", "-z", "--find-renames", ...range, "--"],
    { encoding: "utf8" }
  );

  if (result.error || result.status !== 0) {
    const detail =
      result.error?.message ?? result.stderr.trim() ?? "unknown error";
    throw new Error(
      `Git could not compare the requested changes (${detail}). Fetch the base and head commits, then retry the command.`
    );
  }

  return parseChanges(result.stdout);
};

// This exact startup substitution cannot alter the OpenAPI contract. Any other
// main.py change (including a route added alongside it) keeps the companion gate.
const telemetryOnlyStartupChange = (comparison) => {
  const file = "apps/api/fastapi/src/main.py";
  const refs =
    comparison.mode === "staged"
      ? [`HEAD:${file}`, `:${file}`]
      : [`${comparison.base}:${file}`, `${comparison.head}:${file}`];
  const versions = refs.map((ref) =>
    spawnSync("git", ["show", ref], { encoding: "utf8" })
  );
  if (versions.some((result) => result.error || result.status !== 0))
    return false;
  const before = versions[0].stdout;
  const after = versions[1].stdout;
  const expected = before
    .replace(
      "from src.utils.router import router as utils_router",
      "from src.telemetry import sentry_options\nfrom src.utils.router import router as utils_router"
    )
    .replace("        enable_tracing=True,", "        **sentry_options(),");
  const middlewareExpected = before
    .replace(
      "from src.audit.router",
      "from src import operational_metrics\nfrom src.audit.router"
    )
    .replace(
      `async def request_logging_middleware(request: Request, call_next: Any) -> Any:
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
    return response`,
      `async def request_logging_middleware(request: Request, call_next: Any) -> Any:
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
    return response`
    );
  return (
    before !== after && (expected === after || middlewareExpected === after)
  );
};

// This exact query fix includes areas without a section in the existing
// response model; it does not change the OpenAPI contract.
const janitorialUnsectionedAreaChange = (comparison) => {
  const file = "apps/api/fastapi/src/janitorial/router.py";
  const refs =
    comparison.mode === "staged"
      ? [`HEAD:${file}`, `:${file}`]
      : [`${comparison.base}:${file}`, `${comparison.head}:${file}`];
  const versions = refs.map((ref) =>
    spawnSync("git", ["show", ref], { encoding: "utf8" })
  );
  if (versions.some((result) => result.error || result.status !== 0))
    return false;
  const before = versions[0].stdout;
  const after = versions[1].stdout;
  const expected = before.replace(
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
  return before !== after && expected === after;
};

// Only isolate the existing CAP advisory session. Route declarations, request
// fields and response types must remain identical for this exception to apply.
const wxproductsAdvisorySessionChange = (comparison) => {
  const file = "apps/api/fastapi/src/wxproducts/router.py";
  const refs =
    comparison.mode === "staged"
      ? [`HEAD:${file}`, `:${file}`]
      : [`${comparison.base}:${file}`, `${comparison.head}:${file}`];
  const versions = refs.map((ref) =>
    spawnSync("git", ["show", ref], { encoding: "utf8" })
  );
  if (versions.some((result) => result.error || result.status !== 0))
    return false;
  const before = versions[0].stdout;
  const after = versions[1].stdout;
  const expected = before
    .replace("from src.dependencies import SessionDep\n\n", "")
    .replace(
      "from .dependencies import AuthorDep, AuthoringSessionDep, WxProductsSessionDep",
      "from .dependencies import (\n    AdvisorySessionDep,\n    AuthorDep,\n    AuthoringSessionDep,\n    WxProductsSessionDep,\n)"
    )
    .replaceAll("cap_session: SessionDep,", "cap_session: AdvisorySessionDep,");
  return before !== after && expected === after;
};

const OPENAPI_MAX_BYTES = 64 * 1024 * 1024;

// info.title does not affect Kubb output; regeneration can legitimately be clean.
// Compare the whole document after changing only that field, failing closed.
const openApiTitleOnlyChange = (comparison) => {
  const file = "apps/api/fastapi/openapi.json";
  const refs =
    comparison.mode === "staged"
      ? [`HEAD:${file}`, `:${file}`]
      : [`${comparison.base}:${file}`, `${comparison.head}:${file}`];
  try {
    const versions = refs.map((ref) => {
      // The schema is over 1 MB, spawnSync's default output limit.
      const result = spawnSync("git", ["show", ref], {
        encoding: "utf8",
        maxBuffer: OPENAPI_MAX_BYTES,
      });
      if (result.error || result.status !== 0)
        throw new Error("Missing schema");
      return JSON.parse(result.stdout);
    });
    const [before, after] = versions;
    if (
      typeof before.info?.title !== "string" ||
      typeof after.info?.title !== "string" ||
      before.info.title === after.info.title
    )
      return false;
    before.info.title = after.info.title;
    return JSON.stringify(before) === JSON.stringify(after);
  } catch {
    return false;
  }
};

// This provider callback is deliberately excluded from OpenAPI. Permit changes
// inside its two existing functions only; imports, route metadata, signatures,
// additional functions and registration remain subject to the companion gate.
const hiddenWebhookImplementationChange = (comparison) => {
  const file = "apps/api/fastapi/src/webhooks/router.py";
  const refs =
    comparison.mode === "staged"
      ? [`HEAD:${file}`, `:${file}`]
      : [`${comparison.base}:${file}`, `${comparison.head}:${file}`];
  const versions = refs.map((ref) =>
    spawnSync("git", ["show", ref], { encoding: "utf8" })
  );
  if (versions.some((result) => result.error || result.status !== 0))
    return false;
  const result = spawnSync(
    "python3",
    [
      "-c",
      `
import ast, json, sys
def contract(source):
    # The API formatter targets 3.14; guardrail hosts may run Python 3.11.
    for exceptions in ("binascii.Error, ValueError", "json.JSONDecodeError, UnicodeDecodeError"):
        source = source.replace("except " + exceptions + ":", "except (" + exceptions + "):")
    tree = ast.parse(source)
    found = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in {"_verify_svix_signature", "resend_webhook"}:
            if node.name == "resend_webhook":
                assert any(isinstance(d, ast.Call) and any(k.arg == "include_in_schema" and isinstance(k.value, ast.Constant) and k.value.value is False for k in d.keywords) for d in node.decorator_list)
            found.add(node.name)
            node.body = [ast.Pass()]
    assert len(found) == 2
    tree.body = [node for node in tree.body if not (isinstance(node, ast.Import) and len(node.names) == 1 and node.names[0].name == "binascii" and node.names[0].asname is None)]
    return ast.dump(tree)
before, after = json.load(sys.stdin)
sys.exit(0 if before != after and contract(before) == contract(after) else 1)
`,
    ],
    {
      input: JSON.stringify(versions.map((version) => version.stdout)),
      encoding: "utf8",
    }
  );
  return !result.error && result.status === 0;
};

const evaluateChanges = (changes, comparison) => {
  const files = new Set(changes.flatMap((change) => change.paths));
  const triggers = [...files]
    .filter(
      (file) =>
        isFastApiContractFile(file) &&
        !(
          (file === "apps/api/fastapi/src/main.py" &&
            telemetryOnlyStartupChange(comparison)) ||
          (file === "apps/api/fastapi/src/janitorial/router.py" &&
            janitorialUnsectionedAreaChange(comparison)) ||
          (file === "apps/api/fastapi/src/wxproducts/router.py" &&
            wxproductsAdvisorySessionChange(comparison)) ||
          (file === "apps/api/fastapi/src/webhooks/router.py" &&
            hiddenWebhookImplementationChange(comparison))
        )
    )
    .sort();
  const violations = [];
  const generatedClientChanged = [...files].some((file) =>
    file.startsWith("packages/api-client/src/gen/")
  );
  const missingContractCompanions = [];

  if (triggers.length > 0 && !files.has("apps/api/fastapi/openapi.json")) {
    missingContractCompanions.push("apps/api/fastapi/openapi.json");
  }
  if (triggers.length > 0 && !generatedClientChanged) {
    missingContractCompanions.push("packages/api-client/src/gen/");
  }
  if (triggers.length > 0 && !files.has("docs/api/contracts.md")) {
    missingContractCompanions.push("docs/api/contracts.md");
  }
  if (missingContractCompanions.length > 0) {
    violations.push({
      missing: missingContractCompanions,
      resolution:
        "Regenerate the committed OpenAPI document, run pnpm generate:api-client, and update the API contract documentation.",
      rule: "FastAPI contract companions",
      triggers,
    });
  }

  if (
    triggers.length === 0 &&
    files.has("apps/api/fastapi/openapi.json") &&
    !generatedClientChanged &&
    !openApiTitleOnlyChange(comparison)
  ) {
    violations.push({
      missing: ["packages/api-client/src/gen/"],
      resolution:
        "Run pnpm generate:api-client and commit the generated files.",
      rule: "OpenAPI-to-client sync",
      triggers: ["apps/api/fastapi/openapi.json"],
    });
  }

  return violations;
};

const reportConsumerValidation = (changes) => {
  const files = new Set(changes.flatMap((change) => change.paths));
  const ciGates = "pnpm type-check, pnpm test, and pnpm build";

  if ([...files].some((file) => file.startsWith("packages/auth/"))) {
    console.log(
      `Auth consumer validation required: validate auth, gaa-admin, docs, gms, signal, including docs and gms delegation via AUTH_API_URL. CI enforces ${ciGates}.`
    );
  }

  if ([...files].some((file) => file.startsWith("packages/ui/"))) {
    console.log(
      `Shared UI consumer validation required: validate every importing app. CI enforces ${ciGates}.`
    );
  }

  if (
    [...files].some((file) =>
      file.startsWith("apps/web/gaa-admin/src/app/(admin)/")
    )
  ) {
    console.log(
      `Admin route validation required: validate cap, hr, wxwatch, wxproducts, and salesbus. CI enforces ${ciGates}.`
    );
  }
};

const reportViolations = (violations) => {
  console.error("Blast-radius check failed.");
  for (const violation of violations) {
    console.error(`\nRule: ${violation.rule}`);
    console.error("Triggering files:");
    for (const file of violation.triggers) {
      console.error(`  - ${file}`);
    }
    console.error("Missing companion changes:");
    for (const file of violation.missing) {
      console.error(`  - ${file}`);
    }
    console.error(`Resolve: ${violation.resolution}`);
  }
};

const comparison = parseArguments(process.argv.slice(2));
if (!comparison) {
  fail("choose exactly one comparison mode and provide every required value.");
} else if (
  comparison.mode === "staged" &&
  process.env.SKIP_BLAST_RADIUS === "1"
) {
  console.log("Local staged blast-radius check skipped (SKIP_BLAST_RADIUS=1).");
} else {
  try {
    const changes = collectChanges(comparison);
    reportConsumerValidation(changes);
    const violations = evaluateChanges(changes, comparison);
    if (violations.length > 0) {
      reportViolations(violations);
      process.exitCode = 1;
    } else {
      console.log("Blast-radius check passed.");
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
