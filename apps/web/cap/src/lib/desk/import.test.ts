import type { CapAlertPublic } from "@barrelsgd/api-client";
import { describe, expect, it, vi } from "vitest";
import { describeImportError, outcomeFromAlert } from "./import";
import { importInputSchema, MAX_IMPORT_BYTES } from "./import-input";

const auth = vi.hoisted(() => {
  class FakeAuthApiError extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
      super(detail);
      this.status = status;
      this.detail = detail;
    }
  }
  return {
    FakeAuthApiError,
    isAuthApiError: (error: unknown) => error instanceof FakeAuthApiError,
  };
});
vi.mock("@barrelsgd/auth", () => ({
  isAuthApiError: auth.isAuthApiError,
}));
const { FakeAuthApiError } = auth;

const PATTERN_1 = /Nothing was saved/;
const TOO_LARGE_TEXT = /larger than 5 MB/;

describe("importInputSchema", () => {
  it("accepts a reviewed XML paste with surrounding space trimmed", () => {
    const parsed = importInputSchema.safeParse({
      reviewed: true,
      source: "xml",
      value: "  <alert/>  ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.value).toBe("<alert/>");
  });

  it("refuses an import the forecaster has not confirmed", () => {
    const parsed = importInputSchema.safeParse({
      reviewed: false,
      source: "url",
      value: "https://example.org/a.xml",
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses an empty value with a plain message", () => {
    const parsed = importInputSchema.safeParse({
      reviewed: true,
      source: "xml",
      value: "   ",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(
        "Paste the CAP XML or the public https address."
      );
    }
  });

  it("refuses a source other than xml or url", () => {
    const parsed = importInputSchema.safeParse({
      reviewed: true,
      source: "email",
      value: "x",
    });
    expect(parsed.success).toBe(false);
  });
});

function alert(overrides: Partial<CapAlertPublic>): CapAlertPublic {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    schema_conformant: true,
    schema_error: null,
    ...overrides,
  } as CapAlertPublic;
}

describe("outcomeFromAlert", () => {
  it("reports a conformant import with no problems", () => {
    expect(outcomeFromAlert(alert({}))).toEqual({
      alertId: "11111111-2222-4333-8444-555555555555",
      ok: true,
      schemaConformant: true,
      schemaProblems: [],
    });
  });

  it("lists each schema problem of a non-conformant import", () => {
    const outcome = outcomeFromAlert(
      alert({
        schema_conformant: false,
        schema_error: "line 3: bad sent; line 9: missing area",
      })
    );
    expect(outcome).toMatchObject({
      ok: true,
      schemaConformant: false,
      schemaProblems: ["line 3: bad sent", "line 9: missing area"],
    });
  });

  it("never reports a non-conformant import without a reason", () => {
    const outcome = outcomeFromAlert(
      alert({ schema_conformant: false, schema_error: null })
    );
    expect(outcome.ok && outcome.schemaProblems.length).toBe(1);
  });
});

describe("describeImportError", () => {
  it("shows the reason for a refused document and says nothing was saved", () => {
    const result = describeImportError(
      new FakeAuthApiError(400, "CAP import failed: malformed XML at line 2")
    );
    expect(result.kind).toBe("validation");
    expect(result.title).toMatch(PATTERN_1);
    expect(result.items).toEqual(["malformed XML at line 2"]);
  });

  it("keeps a 400 reason that is not the usual prefix", () => {
    const result = describeImportError(
      new FakeAuthApiError(400, "only https is fetched for CAP imports")
    );
    expect(result.items).toEqual(["only https is fetched for CAP imports"]);
  });

  it("maps a refusal to a plain no-access state", () => {
    const result = describeImportError(new FakeAuthApiError(403, "Forbidden"));
    expect(result.kind).toBe("not-allowed");
    expect(result.title).toBe("You do not have permission for this action.");
  });

  it("treats an unknown failure as a service that did not answer", () => {
    const result = describeImportError(new FakeAuthApiError(503, "down"));
    expect(result.kind).toBe("unavailable");
  });
});

describe("importInputSchema size limit", () => {
  it("accepts a document at the API cap and refuses one byte over", () => {
    const atCap = "a".repeat(MAX_IMPORT_BYTES);
    expect(
      importInputSchema.safeParse({
        reviewed: true,
        source: "xml",
        value: atCap,
      }).success
    ).toBe(true);
    const parsed = importInputSchema.safeParse({
      reviewed: true,
      source: "xml",
      value: `${atCap}a`,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(TOO_LARGE_TEXT);
    }
  });

  it("counts UTF-8 bytes, not characters", () => {
    // 3 bytes per character: the cap in characters is a third of the byte cap.
    const multibyte = "€".repeat(Math.floor(MAX_IMPORT_BYTES / 3) + 1);
    expect(
      importInputSchema.safeParse({
        reviewed: true,
        source: "xml",
        value: multibyte,
      }).success
    ).toBe(false);
  });
});
