import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { contractDocReasons } from "./contract-doc-reasons.mjs";

const op = (operationId, extra = {}) => ({
  operationId,
  summary: operationId,
  responses: { 200: { description: "OK" } },
  security: [{ bearer: [] }],
  ...extra,
});
const spec = (paths, components = {}) => ({
  openapi: "3.1.0",
  paths,
  components,
});

test("no change gives no reasons", () => {
  const s = spec({ "/api/v1/a/org/x": { get: op("x") } });
  assert.deepEqual(contractDocReasons(s, s, ""), []);
});

test("an added private route needs no contract edit", () => {
  const before = spec({ "/api/v1/a/org/x": { get: op("x") } });
  const after = spec({
    "/api/v1/a/org/x": { get: op("x"), post: op("createX") },
  });
  assert.deepEqual(contractDocReasons(before, after, ""), []);
});

test("an added public, webhook or unversioned route needs an edit", () => {
  const before = spec({});
  for (const path of [
    "/api/v1/a/public/x",
    "/api/v1/webhooks/stripe",
    "/api/cap/alerts.xml",
  ]) {
    const reasons = contractDocReasons(
      before,
      spec({ [path]: { get: op("x") } }),
      ""
    );
    assert.ok(
      reasons.some((r) => r.startsWith("added public or webhook operation")),
      path
    );
  }
});

test("a removed route needs an edit", () => {
  const before = spec({
    "/api/v1/a/org/x": { get: op("x"), delete: op("dropX") },
  });
  const after = spec({ "/api/v1/a/org/x": { get: op("x") } });
  assert.ok(
    contractDocReasons(before, after, "").includes(
      "removed operation DELETE /api/v1/a/org/x"
    )
  );
});

test("changed authentication needs an edit, including root-level security", () => {
  const before = {
    ...spec({
      "/api/v1/a/org/x": { get: { operationId: "x", responses: {} } },
    }),
    security: [{ bearer: [] }],
  };
  const after = spec({
    "/api/v1/a/org/x": { get: { operationId: "x", responses: {} } },
  });
  assert.ok(
    contractDocReasons(before, after, "").includes(
      "changed authentication on GET /api/v1/a/org/x"
    )
  );
});

test("a schema change on a described route needs an edit; on an undescribed route it does not", () => {
  const path = "/api/v1/a/org/items/{item_id}";
  const ref = { $ref: "#/components/schemas/Item" };
  const responses = {
    200: {
      description: "OK",
      content: { "application/json": { schema: ref } },
    },
  };
  const item = (props) => ({ Item: { type: "object", properties: props } });
  const before = spec(
    { [path]: { get: op("getItem", { responses }) } },
    {
      schemas: item({ id: { type: "string" } }),
    }
  );
  const after = spec(
    { [path]: { get: op("getItem", { responses }) } },
    {
      schemas: item({ id: { type: "string" }, note: { type: "string" } }),
    }
  );
  // The document writes the path with a different parameter name.
  const described = "Items: `GET /api/v1/a/org/items/{id}` returns one item.";
  assert.ok(
    contractDocReasons(before, after, described).some((r) =>
      r.endsWith("which docs/api/contracts.md already describes")
    )
  );
  assert.deepEqual(
    contractDocReasons(before, after, "Nothing about items."),
    []
  );
});

test("a self-referencing schema does not loop", () => {
  const schemas = {
    Node: {
      type: "object",
      properties: { child: { $ref: "#/components/schemas/Node" } },
    },
  };
  const responses = {
    200: {
      description: "OK",
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/Node" } },
      },
    },
  };
  const s = spec(
    { "/api/v1/a/org/tree": { get: op("tree", { responses }) } },
    { schemas }
  );
  assert.deepEqual(contractDocReasons(s, s, "/api/v1/a/org/tree"), []);
});

test("the committed spec compares with itself quickly and cleanly", () => {
  const committed = JSON.parse(
    readFileSync(
      new URL("../../apps/api/fastapi/openapi.json", import.meta.url),
      "utf8"
    )
  );
  const contracts = readFileSync(
    new URL("../../docs/api/contracts.md", import.meta.url),
    "utf8"
  );
  const started = performance.now();
  assert.deepEqual(contractDocReasons(committed, committed, contracts), []);
  assert.ok(performance.now() - started < 10_000);
});
