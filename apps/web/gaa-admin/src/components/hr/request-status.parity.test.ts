import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { requestStatus } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { EDITABLE_REQUEST_STATUSES } from "./request-status";

/** Reads a file from the monorepo root, found by walking up from this test. */
function repoFile(relativePath: string): string {
  let dir = import.meta.dirname;
  while (!existsSync(path.join(dir, "apps/api/fastapi"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("monorepo root not found");
    dir = parent;
  }
  return readFileSync(path.join(dir, relativePath), "utf8");
}

function openApiEnum(name: string): string[] {
  const doc = JSON.parse(repoFile("apps/api/fastapi/openapi.json")) as {
    components: { schemas: Record<string, { enum?: string[] }> };
  };
  const values = doc.components.schemas[name]?.enum;
  if (!values) throw new Error(`openapi.json has no enum ${name}`);
  return values;
}

const EDITABLE_STATUSES_LINE =
  /^EDITABLE_STATUSES = frozenset\(\{([^}]*)\}\)/mu;
const REQUEST_STATUS_MEMBER = /RequestStatus\.(\w+)/gu;

describe("HR request status parity", () => {
  it("generated client values equal the API RequestStatus enum", () => {
    expect(Object.values(requestStatus).sort()).toEqual(
      openApiEnum("RequestStatus").sort()
    );
  });

  it("editable statuses equal EDITABLE_STATUSES in the FastAPI HR models", () => {
    const python = repoFile("apps/api/fastapi/src/hr/models.py");
    const block = EDITABLE_STATUSES_LINE.exec(python);
    if (!block?.[1])
      throw new Error("EDITABLE_STATUSES not found in models.py");
    const backend = [...block[1].matchAll(REQUEST_STATUS_MEMBER)].map(
      (match) => match[1]
    );
    expect(backend.length).toBeGreaterThan(0);
    expect([...EDITABLE_REQUEST_STATUSES].sort()).toEqual(backend.sort());
  });
});
