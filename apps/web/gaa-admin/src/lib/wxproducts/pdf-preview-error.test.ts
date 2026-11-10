import { expect, it } from "vitest";
import { PDF_PREVIEW_FALLBACK, pdfPreviewRefusal } from "./pdf-preview-error";

it("shows the API's own message for a refused preview (4xx with detail)", () => {
  expect(
    pdfPreviewRefusal(422, {
      detail: "Forecast: Weather forecast is required",
    })
  ).toBe("Forecast: Weather forecast is required");
  expect(pdfPreviewRefusal(403, { detail: "Not allowed to preview" })).toBe(
    "Not allowed to preview"
  );
});

it("keeps the generic message for server errors, even with a detail", () => {
  expect(pdfPreviewRefusal(500, { detail: "database offline" })).toBeNull();
  expect(pdfPreviewRefusal(503, { detail: "try later" })).toBeNull();
});

it("keeps the generic message when a 4xx carries no usable detail", () => {
  expect(pdfPreviewRefusal(422, { error: "x" })).toBeNull();
  expect(pdfPreviewRefusal(422, { detail: "   " })).toBeNull();
  expect(pdfPreviewRefusal(422, null)).toBeNull();
  expect(pdfPreviewRefusal(422, "<html>")).toBeNull();
});

it("has a fallback that names the connection and retry", () => {
  expect(PDF_PREVIEW_FALLBACK).toBe(
    "Could not render the preview. Check your connection and retry the PDF preview."
  );
});
