import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AWAITING_DELIVERY } from "./types";

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

const OPEN_FOR_DELIVERY_BLOCK = /^OPEN_FOR_DELIVERY = \(([^)]*)\)/mu;
const REQUISITION_STATUS_MEMBER = /RequisitionStatus\.(\w+)/gu;

describe("salesbus awaiting-delivery parity", () => {
  it("equals OPEN_FOR_DELIVERY in the FastAPI stores service", () => {
    const block = OPEN_FOR_DELIVERY_BLOCK.exec(
      repoFile("apps/api/fastapi/src/stores/service.py")
    );
    if (!block?.[1])
      throw new Error("OPEN_FOR_DELIVERY not found in service.py");
    const backend = [...block[1].matchAll(REQUISITION_STATUS_MEMBER)]
      .map((match) => match[1])
      .sort();
    expect(backend.length).toBeGreaterThan(0);
    expect([...AWAITING_DELIVERY].sort()).toEqual(backend);
  });
});
