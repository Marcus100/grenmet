import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCKED_PERIOD_STATUSES } from "./period-status";

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

const LOCKED_STATUSES_BLOCK =
  /^LOCKED_STATUSES = frozenset\(\s*\{([^}]*)\}\s*\)/mu;
const PAY_PERIOD_STATUS_MEMBER = /PayPeriodStatus\.(\w+)/gu;

describe("payroll period status parity", () => {
  it("locked statuses equal LOCKED_STATUSES in the FastAPI payroll models", () => {
    const block = LOCKED_STATUSES_BLOCK.exec(
      repoFile("apps/api/fastapi/src/hr/payroll/models.py")
    );
    if (!block?.[1]) throw new Error("LOCKED_STATUSES not found in models.py");
    const backend = [...block[1].matchAll(PAY_PERIOD_STATUS_MEMBER)]
      .map((match) => match[1])
      .sort();
    expect(backend.length).toBeGreaterThan(0);
    expect([...LOCKED_PERIOD_STATUSES].sort()).toEqual(backend);
  });
});
