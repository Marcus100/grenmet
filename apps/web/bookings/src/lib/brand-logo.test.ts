import { describe, expect, it } from "vitest";
import {
  isLogoFileId,
  LOGO_ACCEPT,
  LOGO_MAX_BYTES,
  logoProblem,
  logoSrc,
} from "./brand-logo";

const FILE = "6f1c2a3e-1b2c-4d5e-8f90-a1b2c3d4e5f6";
const PNG_TEXT = /Export the logo as a PNG/u;
const SVG_TEXT = /SVG files cannot be used/u;
const SIZE_TEXT = /larger than 2 MB/u;

describe("logoProblem", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])(
    "accepts %s up to 2 MB",
    (type) => {
      expect(logoProblem({ size: 1024, type })).toBeNull();
      expect(logoProblem({ size: LOGO_MAX_BYTES, type })).toBeNull();
    }
  );

  it("asks for an export to PNG when the file is an SVG", () => {
    expect(
      logoProblem({ name: "logo.svg", size: 10, type: "image/svg+xml" })
    ).toMatch(PNG_TEXT);
    expect(logoProblem({ name: "LOGO.SVG", size: 10, type: "" })).toMatch(
      SVG_TEXT
    );
  });

  it("refuses other formats in plain words", () => {
    expect(logoProblem({ name: "logo.gif", size: 10, type: "image/gif" })).toBe(
      "Choose a JPEG, PNG or WebP image."
    );
  });

  it("refuses a file over 2 MB", () => {
    expect(
      logoProblem({ size: LOGO_MAX_BYTES + 1, type: "image/png" })
    ).toMatch(SIZE_TEXT);
  });

  it("offers the same types the file picker accepts", () => {
    expect(LOGO_ACCEPT).toBe("image/jpeg,image/png,image/webp");
  });
});

describe("logo file ids and sources", () => {
  it("accepts a UUID and nothing else", () => {
    expect(isLogoFileId(FILE)).toBe(true);
    expect(isLogoFileId("../../etc/passwd")).toBe(false);
    expect(isLogoFileId("")).toBe(false);
    expect(isLogoFileId(`${FILE}/x`)).toBe(false);
  });

  it("serves a stored logo from the same origin", () => {
    expect(logoSrc(FILE)).toBe(`/files/${FILE}`);
  });
});
