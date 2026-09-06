import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const SCHEMA_REF = /^#\/components\/schemas\//;

const schema = JSON.parse(
  readFileSync(
    new URL("../../../apps/api/fastapi/openapi.json", import.meta.url),
    "utf8"
  )
);

it.each([
  "leave-requests",
  "absentee-reports",
  "status-reports",
  "shift-swaps",
  "timesheets",
])("documents a typed 201 success for creating %s", (resource) => {
  const responses = schema.paths[`/api/v1/hr/${resource}`].post.responses;
  expect(responses["200"]).toBeUndefined();
  expect(responses["201"].content["application/json"].schema.$ref).toMatch(
    SCHEMA_REF
  );
});
