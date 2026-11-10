import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { invoiceStatus } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { INVOICE_STATUSES, isOpenInvoice } from "./invoice-form";

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

const OPEN_STATUSES_LINE = /^OPEN_STATUSES = \(([^)]*)\)/mu;
const INVOICE_STATUS_MEMBER = /InvoiceStatus\.(\w+)\.value/gu;

describe("invoice status parity", () => {
  it("lists the API InvoiceStatus enum from the generated client", () => {
    const doc = JSON.parse(repoFile("apps/api/fastapi/openapi.json")) as {
      components: { schemas: Record<string, { enum?: string[] }> };
    };
    expect([...INVOICE_STATUSES].sort()).toEqual(
      [...(doc.components.schemas.InvoiceStatus?.enum ?? [])].sort()
    );
    expect(INVOICE_STATUSES).toEqual(Object.values(invoiceStatus));
  });

  it("treats as open exactly the statuses OPEN_STATUSES lists in FastAPI", () => {
    const python = repoFile("apps/api/fastapi/src/billing/invoices.py");
    const block = OPEN_STATUSES_LINE.exec(python);
    if (!block?.[1]) throw new Error("OPEN_STATUSES not found in invoices.py");
    // Each FastAPI member name is the lower-case value: PARTIALLY_PAID -> partially_paid.
    const backend = [...block[1].matchAll(INVOICE_STATUS_MEMBER)]
      .map((match) => match[1]?.toLowerCase())
      .sort();
    expect(backend.length).toBeGreaterThan(0);
    const frontend = INVOICE_STATUSES.filter(isOpenInvoice).sort();
    expect(frontend).toEqual(backend);
  });
});
