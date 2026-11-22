import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// app/favicon.ico is Next's metadata convention: it serves /favicon.ico, so
// browsers stop logging a 404 on every load. It must be the Grenada Airports
// Authority mark (public/images/gaa-logo-blue.png), not the Commit mark.
const readIcon = (relativePath: string) =>
  readFileSync(join(import.meta.dirname, relativePath));

const gaaIcon = readIcon("favicon.ico");
const commitIcon = readIcon("../../../commit/src/app/favicon.ico");

// ICO layout: 6-byte header (reserved 0, type 1, image count at byte 4), then
// one 16-byte directory entry per image, whose first byte is the width (0 = 256).
function icoWidths(icon: Buffer): number[] {
  const count = icon.readUInt16LE(4);
  return Array.from(
    { length: count },
    (_, index) => icon.readUInt8(6 + index * 16) || 256
  );
}

describe("favicon", () => {
  it("ships app/favicon.ico as an ICO file", () => {
    // ICO header: reserved 0, type 1 (icon), at least one image.
    expect([...gaaIcon.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
  });

  it("contains the 16, 32 and 48 px sizes", () => {
    expect(icoWidths(gaaIcon)).toEqual([16, 32, 48]);
  });

  it("is not the Commit mark", () => {
    expect(gaaIcon.equals(commitIcon)).toBe(false);
  });
});
