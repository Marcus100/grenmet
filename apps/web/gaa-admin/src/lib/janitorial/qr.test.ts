import { describe, expect, it } from "vitest";
import { qrMatrix, qrPayload } from "./qr";

describe("qrPayload", () => {
  it("links into the janitor app when its origin is known", () => {
    expect(qrPayload("GND-A0010", "https://janitor.example.com/")).toBe(
      "https://janitor.example.com/a/GND-A0010"
    );
  });

  it("falls back to the bare area code", () => {
    expect(qrPayload("CRU-A0501")).toBe("CRU-A0501");
  });
});

describe("qrMatrix", () => {
  it("draws a square symbol with finder patterns", () => {
    const { path, size } = qrMatrix("GND-A0010");
    // Version 1 (21×21) is enough for a short area code.
    expect(size).toBe(21);
    // Top-left finder pattern corner module is always dark.
    expect(path.startsWith("M0 0h1v1h-1z")).toBe(true);
  });
});
