import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compareSpecs, typeSet } from "./check-api-breaking.mjs";

const json = (schema) => ({ content: { "application/json": { schema } } });

function spec(operation, schemas = {}) {
  return {
    paths: { "/api/v1/things": { get: operation, post: operation } },
    components: { schemas },
  };
}

const thing = (props, required = []) => ({
  type: "object",
  properties: props,
  required,
});

function opWith({ parameters, requestBody, responseSchema } = {}) {
  return {
    operationId: "listThings",
    parameters,
    requestBody,
    responses: {
      200: {
        description: "ok",
        ...json(responseSchema ?? thing({ id: { type: "string" } })),
      },
    },
  };
}

const contains = (text, needle) =>
  assert.ok(text.includes(needle), `expected "${needle}" in: ${text}`);

const errorsFor = (base, head) => compareSpecs(base, head).errors;

test("identical specs have no findings", () => {
  const s = spec(opWith());
  assert.deepEqual(compareSpecs(s, structuredClone(s)), {
    errors: [],
    warnings: [],
  });
});

test("additive changes are allowed", () => {
  const base = spec(opWith());
  const head = spec(
    opWith({
      parameters: [
        { name: "q", in: "query", required: false, schema: { type: "string" } },
      ],
      responseSchema: thing({
        id: { type: "string" },
        extra: { type: "integer" },
      }),
    })
  );
  head.paths["/api/v1/new"] = { get: opWith() };
  assert.deepEqual(errorsFor(base, head), []);
});

test("removed path and removed method are breaking", () => {
  const base = spec(opWith());
  const noPath = { paths: {}, components: {} };
  assert.equal(errorsFor(base, noPath).length, 2);
  const noPost = structuredClone(base);
  noPost.paths["/api/v1/things"].post = undefined;
  contains(
    errorsFor(base, noPost)[0],
    "POST /api/v1/things: operation removed"
  );
});

test("new required parameter is breaking; optional becoming required is breaking", () => {
  const base = spec(
    opWith({
      parameters: [
        { name: "a", in: "query", required: false, schema: { type: "string" } },
      ],
    })
  );
  const newRequired = spec(
    opWith({
      parameters: [
        { name: "a", in: "query", required: false, schema: { type: "string" } },
        { name: "b", in: "query", required: true, schema: { type: "string" } },
      ],
    })
  );
  contains(errorsFor(base, newRequired)[0], "new required query parameter 'b'");
  const nowRequired = spec(
    opWith({
      parameters: [
        { name: "a", in: "query", required: true, schema: { type: "string" } },
      ],
    })
  );
  contains(errorsFor(base, nowRequired)[0], "'a' became required");
});

test("request body: newly required body and newly required property are breaking", () => {
  const optionalBody = {
    required: false,
    ...json(thing({ a: { type: "string" } })),
  };
  const base = spec(opWith({ requestBody: optionalBody }));
  const required = spec(
    opWith({ requestBody: { ...optionalBody, required: true } })
  );
  contains(errorsFor(base, required)[0], "body became required");
  const newProp = spec(
    opWith({
      requestBody: {
        required: false,
        ...json(thing({ a: { type: "string" } }, ["a"])),
      },
    })
  );
  contains(
    errorsFor(base, newProp)[0],
    ".a: request property is newly required"
  );
});

test("request types may widen but not narrow", () => {
  const withType = (schema) =>
    spec(
      opWith({
        requestBody: { required: true, ...json(thing({ a: schema }, [])) },
      })
    );
  const str = withType({ type: "string" });
  const strOrNull = withType({ anyOf: [{ type: "string" }, { type: "null" }] });
  assert.deepEqual(errorsFor(str, strOrNull), []);
  contains(errorsFor(strOrNull, str)[0], "request type changed");
  contains(
    errorsFor(str, withType({ type: "integer" }))[0],
    "request type changed"
  );
});

test("request enum: removing a value is breaking, adding is not", () => {
  const withEnum = (values) =>
    spec(
      opWith({
        requestBody: {
          required: true,
          ...json(thing({ s: { type: "string", enum: values } })),
        },
      })
    );
  assert.deepEqual(errorsFor(withEnum(["a"]), withEnum(["a", "b"])), []);
  contains(
    errorsFor(withEnum(["a", "b"]), withEnum(["a"]))[0],
    "no longer accepted: b"
  );
});

test("response: removed property, widened type and removed 2xx are breaking", () => {
  const base = spec(
    opWith({
      responseSchema: thing({ id: { type: "string" }, n: { type: "integer" } }),
    })
  );
  const removed = spec(
    opWith({ responseSchema: thing({ id: { type: "string" } }) })
  );
  contains(errorsFor(base, removed)[0], ".n: response property removed");

  const nullable = spec(
    opWith({
      responseSchema: thing({
        id: { anyOf: [{ type: "string" }, { type: "null" }] },
        n: { type: "integer" },
      }),
    })
  );
  contains(
    errorsFor(base, nullable)[0],
    "response type changed string -> null|string"
  );

  const noSuccess = structuredClone(base);
  noSuccess.paths["/api/v1/things"].get.responses = {
    204: { description: "gone" },
  };
  assert.ok(
    errorsFor(base, noSuccess).some((e) =>
      e.includes("success response 200 removed")
    )
  );
});

test("response: a new enum value warns instead of failing", () => {
  const withEnum = (values) =>
    spec(
      opWith({ responseSchema: thing({ s: { type: "string", enum: values } }) })
    );
  const result = compareSpecs(withEnum(["a"]), withEnum(["a", "b"]));
  assert.deepEqual(result.errors, []);
  contains(result.warnings[0], "new enum value");
});

test("$ref schemas are resolved, including through arrays", () => {
  const schemas = { Item: thing({ id: { type: "string" } }) };
  const ref = { type: "array", items: { $ref: "#/components/schemas/Item" } };
  const base = spec(opWith({ responseSchema: ref }), schemas);
  const head = spec(opWith({ responseSchema: ref }), { Item: thing({}) });
  contains(errorsFor(base, head)[0], "[].id: response property removed");
});

test("a renamed operationId only warns", () => {
  const base = spec(opWith());
  const head = structuredClone(base);
  head.paths["/api/v1/things"].get.operationId = "renamed";
  const result = compareSpecs(base, head);
  assert.deepEqual(result.errors, []);
  contains(result.warnings[0], "operationId listThings -> renamed");
});

test("typeSet flattens unions and treats unknown schemas as any", () => {
  const empty = { components: {} };
  assert.deepEqual(
    [
      ...typeSet(empty, { anyOf: [{ type: "string" }, { type: "null" }] }),
    ].sort(),
    ["null", "string"]
  );
  assert.deepEqual([...typeSet(empty, {})], ["any"]);
});

test("the checked-in spec is compatible with itself (CLI, exit 0)", () => {
  const spec = "apps/api/fastapi/openapi.json";
  const parsed = JSON.parse(readFileSync(spec, "utf8"));
  assert.ok(Object.keys(parsed.paths).length > 100);
  const result = spawnSync(
    process.execPath,
    ["scripts/api/check-api-breaking.mjs", "--base", "HEAD"],
    {
      encoding: "utf8",
    }
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  contains(result.stdout, "No breaking API changes");
});

test("CLI requires --base", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/api/check-api-breaking.mjs"],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 2);
});
