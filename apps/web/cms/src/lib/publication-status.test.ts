import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { workflowFields } from "../fields/workflow";
import { DOCUMENT_STATUSES, isLive, PUBLISHED } from "./publication-status";

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

describe("CMS document status parity", () => {
  it("matches every status union Payload generated into payload-types.ts", () => {
    const generated = [
      ...repoFile("apps/web/cms/src/payload-types.ts").matchAll(
        /status: ((?:'[a-z]+'\s*\|\s*)*'[a-z]+');/gu
      ),
    ].map((match) =>
      match[1]?.match(/'([a-z]+)'/gu)?.map((v) => v.slice(1, -1))
    );
    expect(generated.length).toBeGreaterThan(0);
    for (const union of generated) {
      expect(union).toEqual([...DOCUMENT_STATUSES]);
    }
  });

  it("offers exactly the document statuses as workflow field options", () => {
    const status = workflowFields.find(
      (field) => "name" in field && field.name === "status"
    );
    expect(status && "options" in status ? status.options : undefined).toEqual(
      DOCUMENT_STATUSES.map((value) => expect.objectContaining({ value }))
    );
  });
});

describe("isLive", () => {
  it("is true only for the published status", () => {
    expect(PUBLISHED).toBe("published");
    expect(isLive({ status: "published" })).toBe(true);
    for (const status of ["draft", "review", undefined, null]) {
      expect(isLive({ status })).toBe(false);
    }
  });

  it("is false for a missing document", () => {
    expect(isLive(undefined)).toBe(false);
    expect(isLive(null)).toBe(false);
  });
});
