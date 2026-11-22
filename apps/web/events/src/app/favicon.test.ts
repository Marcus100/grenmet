import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// app/favicon.ico is Next's metadata convention: it serves /favicon.ico, so
// browsers stop logging a 404 on every load.
describe("favicon", () => {
  it("ships app/favicon.ico as an ICO file", () => {
    const icon = readFileSync(join(import.meta.dirname, "favicon.ico"));
    // ICO header: reserved 0, type 1 (icon), at least one image.
    expect([...icon.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
  });
});
