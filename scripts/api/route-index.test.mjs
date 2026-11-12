import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { collectOperations, renderRouteIndex } from "./route-index.mjs";

const op = (operationId, extra = {}) => ({
  operationId,
  summary: operationId,
  ...extra,
});

test("zone is the usual fourth segment under /api/v1", () => {
  const spec = {
    paths: {
      "/api/v1/events/public/list": { get: op("a") },
      "/api/v1/events/me/list": { get: op("b") },
      "/api/v1/events/org/list": { get: op("c") },
      "/api/v1/events/admin/list": { get: op("d") },
      "/api/v1/events/{event_id}": { get: op("e") },
      "/api/v1/events/public": { get: op("f", { tags: ["events"] }) },
    },
  };
  const zones = Object.fromEntries(
    collectOperations(spec).map((o) => [o.operationId, o.zone])
  );
  assert.deepEqual(zones, {
    a: "public",
    b: "me",
    c: "org",
    d: "admin",
    e: "—",
    f: "public",
  });
});

test("paths outside /api/v1 are public", () => {
  const spec = { paths: { "/api/cap/alerts.xml": { get: op("feed") } } };
  const [record] = collectOperations(spec);
  assert.equal(record.zone, "public");
  assert.equal(record.domain, "cap");
});

test("zone is the first literal zone word after /api/v1, wherever it sits", () => {
  const spec = {
    paths: {
      "/api/v1/admin/moderation/organisers": { get: op("second") },
      "/api/v1/hr/payroll/me/payslips": { get: op("deeper") },
      "/api/v1/hr/leave-requests/me": { get: op("last") },
      "/api/v1/organisations/{organisation_id}/admin/members": {
        get: op("afterParam"),
      },
      "/api/v1/things/{me}/items": { get: op("paramName") },
      "/api/v1/things/admins/items": { get: op("similarWord") },
      "/api/v1/things/org/admin": { get: op("firstWins") },
    },
  };
  const zones = Object.fromEntries(
    collectOperations(spec).map((o) => [o.operationId, o.zone])
  );
  assert.deepEqual(zones, {
    second: "admin",
    deeper: "me",
    last: "me",
    afterParam: "admin",
    paramName: "—",
    similarWord: "—",
    firstWins: "org",
  });
});

test("domain is the path segment after /api/v1, never the tag", () => {
  const spec = {
    paths: {
      "/api/v1/hr/leave": { get: op("tagged", { tags: ["hr-leave"] }) },
      "/api/v1/billing/invoices": { get: op("untagged") },
      "/health": { get: op("bare") },
    },
  };
  const domains = Object.fromEntries(
    collectOperations(spec).map((o) => [o.operationId, o.domain])
  );
  assert.deepEqual(domains, {
    tagged: "hr",
    untagged: "billing",
    bare: "health",
  });
});

test("a backslash in a summary cannot break the table", () => {
  const spec = {
    paths: { "/api/v1/a": { get: op("x", { summary: "a \\| b \\" }) } },
  };
  const [record] = collectOperations(spec);
  assert.equal(record.summary, "a \\\\\\| b \\\\");
});

test("auth uses the operation security, then falls back to the spec root", () => {
  const spec = {
    security: [{ bearer: [] }],
    paths: {
      "/api/v1/a": { get: op("inherits") },
      "/api/v1/b": { get: op("open", { security: [] }) },
      "/api/v1/c": { post: op("own", { security: [{ cookie: [] }] }) },
    },
  };
  const auth = Object.fromEntries(
    collectOperations(spec).map((o) => [o.operationId, o.auth])
  );
  assert.deepEqual(auth, { inherits: "yes", open: "no", own: "yes" });

  const rootless = { paths: { "/api/v1/a": { get: op("x") } } };
  assert.equal(collectOperations(rootless)[0].auth, "no");
});

test("only HTTP method keys count as operations", () => {
  const spec = {
    paths: {
      "/api/v1/a": {
        parameters: [],
        summary: "shared",
        get: op("g"),
        GET: op("upper"),
      },
    },
  };
  const records = collectOperations(spec);
  assert.deepEqual(
    records.map((o) => o.method),
    ["GET"]
  );
});

test("summaries escape pipes and collapse newlines", () => {
  const spec = {
    paths: {
      "/api/v1/a": { get: op("s", { summary: "a | b\r\nsecond\nthird" }) },
    },
  };
  const [record] = collectOperations(spec);
  assert.equal(record.summary, "a \\| b second third");
  const rendered = renderRouteIndex(spec);
  assert.ok(rendered.includes("| a \\| b second third |"));
});

test("sorting is stable for shuffled paths and methods", () => {
  const ordered = {
    paths: {
      "/api/v1/a": {
        get: op("a1"),
        post: op("a2"),
        put: op("a3"),
        patch: op("a4"),
        delete: op("a5"),
        head: op("a6"),
        options: op("a7"),
      },
      "/api/v1/b": { get: op("b1") },
    },
  };
  const shuffled = {
    paths: {
      "/api/v1/b": { get: op("b1") },
      "/api/v1/a": {
        options: op("a7"),
        delete: op("a5"),
        head: op("a6"),
        patch: op("a4"),
        put: op("a3"),
        post: op("a2"),
        get: op("a1"),
      },
    },
  };
  assert.equal(renderRouteIndex(ordered), renderRouteIndex(shuffled));
  assert.deepEqual(
    collectOperations(shuffled).map((o) => o.method),
    ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "GET"]
  );
});

test("one added operation adds exactly one table row", () => {
  const base = {
    paths: {
      "/api/v1/auth/token": { post: op("authToken", { tags: ["auth"] }) },
    },
  };
  const extended = {
    paths: {
      ...base.paths,
      "/api/v1/auth/logout": { post: op("authLogout", { tags: ["auth"] }) },
    },
  };
  const rowsOf = (text) =>
    text
      .split("\n")
      .filter(
        (line) =>
          line.startsWith("| ") &&
          !line.startsWith("| Method") &&
          !line.startsWith("| ---")
      );
  const before = rowsOf(renderRouteIndex(base));
  const after = rowsOf(renderRouteIndex(extended));
  assert.equal(after.length - before.length, 1);
  assert.deepEqual(after.filter((line) => !before.includes(line)).length, 1);
});

test("renders the header, totals and one section per domain", () => {
  const text = renderRouteIndex({
    paths: {
      "/api/v1/auth/token": { post: op("authToken", { tags: ["auth"] }) },
    },
  });
  assert.ok(text.startsWith("# API route index\n"));
  assert.ok(
    text.includes(
      "**Last updated:** generated from `apps/api/fastapi/openapi.json`; do not edit by hand"
    )
  );
  assert.ok(text.includes("Totals: 1 paths and 1 operations."));
  assert.ok(
    text.includes(
      "## auth\n\n| Method | Path | Zone | Auth | Summary | Operation ID |"
    )
  );
  assert.ok(
    text.includes(
      "| POST | `/api/v1/auth/token` | — | no | authToken | `authToken` |"
    )
  );
});

test("the CLI refuses an unknown argument instead of overwriting the file", () => {
  const cli = fileURLToPath(
    new URL("./generate-route-index.mjs", import.meta.url)
  );
  for (const args of [["--chek"], ["--check", "extra"]]) {
    const result = spawnSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
    });
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /Usage:/u);
  }
});
