import { describe, expect, it } from "vitest";
import {
  grenadaDate,
  hrFormFilename,
  pdfFilename,
  productPdfFilename,
  signedDocumentFilename,
} from "./pdf-filename";

const UUID_START = /[0-9a-f]{8}-[0-9a-f]{4}/u;
const PREVIEW_NAME = /^Leave Application Preview - \d{4}-\d{2}-\d{2}\.pdf$/u;
const SIGNED_NAME = /^Leave Application - \d{4}-\d{2}-\d{2}\.pdf$/u;

describe("pdf filenames", () => {
  it("cleans parts and joins them", () => {
    expect(pdfFilename(['A/B:"C"', "", " d "], "rev 2")).toBe(
      "A B C - d (rev 2).pdf"
    );
    expect(pdfFilename([])).toBe("Document.pdf");
  });

  it("reads the Grenada calendar day", () => {
    expect(grenadaDate("2026-10-24T01:00:00Z")).toBe("2026-10-23");
    expect(grenadaDate("2026-10-23T12:00:00Z")).toBe("2026-10-23");
  });

  it("names a saved forecast with its issue hour and revision", () => {
    expect(
      productPdfFilename("morning", { issuedAt: "2026-10-23T07:00" }, 3)
    ).toBe("GMS Morning Forecast 2026-10-23 0700 (rev 3).pdf");
  });

  it("names a bulletin without an hour and labels drafts", () => {
    const values = { issuedAt: "2026-10-23T09:30" };
    expect(productPdfFilename("marine", values, 2)).toBe(
      "GMS Marine Bulletin 2026-10-23 (rev 2).pdf"
    );
    expect(productPdfFilename("marine", values)).toBe(
      "GMS Marine Bulletin 2026-10-23 (draft preview).pdf"
    );
  });

  it("never contains a UUID", () => {
    expect(
      productPdfFilename("heat", { issuedAt: "2026-10-23T09:30" }, 1)
    ).not.toMatch(UUID_START);
  });

  it("names signed copies by form, signer and local date", () => {
    expect(
      signedDocumentFilename(
        "leave_request",
        "Ana Smith",
        "2026-10-24T02:00:00Z",
        1
      )
    ).toBe("Leave Application - Ana Smith - 2026-10-23.pdf");
    expect(
      signedDocumentFilename(
        "leave_request",
        "Ana Smith",
        "2026-10-24T02:00:00Z",
        2
      )
    ).toContain("(rev 2).pdf");
  });

  it("labels unsigned form downloads as previews without a person", () => {
    expect(hrFormFilename("leave_request")).toMatch(PREVIEW_NAME);
    expect(hrFormFilename("leave_request", true)).toMatch(SIGNED_NAME);
  });
});

describe("hrFormFilename for drafts and signed copies", () => {
  it("labels an unsigned download as a preview and a signed one as the document", () => {
    expect(hrFormFilename("leave_request", false, "2026-10-20")).toBe(
      "Leave Application Preview - 2026-10-20.pdf"
    );
    expect(hrFormFilename("leave_request", true, "2026-10-20")).toBe(
      "Leave Application - 2026-10-20.pdf"
    );
  });

  it("uses the report's own day when given one", () => {
    expect(hrFormFilename("status_report", false, "2026-10-19")).toContain(
      "2026-10-19"
    );
    expect(hrFormFilename("status_report", false, "not a day")).not.toContain(
      "not a day"
    );
  });
});
