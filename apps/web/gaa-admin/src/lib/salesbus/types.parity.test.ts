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

// OPEN_FOR_DELIVERY is the allowed-from set of the "deliver_partly" move in the
// FastAPI stores transition table; the table names statuses through short aliases.
const STATUS_ALIAS = /^(_\w+) = RequisitionStatus\.(\w+)/gmu;
const DELIVER_PARTLY_FROM =
  /"deliver_partly": Transition\(frozenset\(\{([^}]*)\}\)/u;

describe("salesbus awaiting-delivery parity", () => {
  it("equals OPEN_FOR_DELIVERY in the FastAPI stores transition table", () => {
    const source = repoFile("apps/api/fastapi/src/stores/transitions.py");
    const aliases = new Map(
      [...source.matchAll(STATUS_ALIAS)].map((match) => [match[1], match[2]])
    );
    const block = DELIVER_PARTLY_FROM.exec(source);
    if (!block?.[1]) {
      throw new Error("deliver_partly not found in stores/transitions.py");
    }
    const backend = block[1]
      .split(",")
      .map((name) => aliases.get(name.trim()))
      .filter((name): name is string => Boolean(name))
      .sort();
    expect(backend.length).toBeGreaterThan(0);
    expect([...AWAITING_DELIVERY].sort()).toEqual(backend);
  });
});
