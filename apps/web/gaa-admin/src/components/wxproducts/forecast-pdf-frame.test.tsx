import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ForecastPdfFrame } from "./forecast-pdf-frame";

const preview = vi.hoisted(() => vi.fn());
vi.mock("@/app/(admin)/wxproducts/product-actions", () => ({
  previewProductPdfAction: preview,
}));

beforeEach(() => {
  vi.useFakeTimers();
  preview.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.useRealTimers());

function frame(summary: string) {
  return (
    <ForecastPdfFrame
      actions={null}
      content={{ kind: "morning", values: { summary } }}
      description="Save draft to download these changes."
      expectedRevision={0}
    />
  );
}

it("renders once edits settle and shows the backend PDF", async () => {
  preview.mockResolvedValue({ ok: true, blob: new Blob(["%PDF"]) });
  const view = render(frame("Sunny"));
  view.rerender(frame("Sunny spells"));
  await act(() => vi.advanceTimersByTimeAsync(999));
  expect(preview).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(preview).toHaveBeenCalledTimes(1);
  expect(preview.mock.calls[0][0]).toMatchObject({
    kind: "morning",
    values: { summary: "Sunny spells" },
  });
  expect(screen.getByTitle("Forecast PDF preview")).toHaveAttribute(
    "src",
    "blob:preview#toolbar=0&navpanes=0&view=FitH"
  );
});

it("cancels a superseded render and reports failures", async () => {
  preview.mockResolvedValue({ ok: false, error: "down" });
  const view = render(frame("A"));
  await act(() => vi.advanceTimersByTimeAsync(1000));
  const firstSignal: AbortSignal = preview.mock.calls[0][1];
  view.rerender(frame("B"));
  expect(firstSignal.aborted).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(screen.getByRole("alert")).toHaveTextContent("Preview unavailable");
});
