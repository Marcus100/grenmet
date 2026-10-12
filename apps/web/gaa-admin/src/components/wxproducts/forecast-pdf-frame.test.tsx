import type { ProductContent } from "@barrelsgd/gms/products";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ForecastPdfFrame, type PdfPreviewRequest } from "./forecast-pdf-frame";

const preview = vi.hoisted(() => vi.fn());
vi.mock("@/app/(admin)/wxproducts/product-actions", () => ({
  previewProductPdfAction: preview,
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

beforeEach(() => {
  preview.mockReset();
  preview.mockResolvedValue({ ok: true, blob: new Blob(["%PDF"]) });
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

function content(summary = "Sunny"): ProductContent {
  return { kind: "morning", values: { summary } };
}
function request(summary = "Sunny", requestId = 1): PdfPreviewRequest {
  return { content: content(summary), expectedRevision: 3, requestId };
}
function frame(
  live: ProductContent,
  snapshot: PdfPreviewRequest | null,
  expanded = true
) {
  return (
    <ForecastPdfFrame
      content={live}
      expanded={expanded}
      onExpandedChange={vi.fn()}
      onRetry={vi.fn()}
      request={snapshot}
    />
  );
}

it("does not render on initial load, editing, or opening the disclosure", () => {
  const view = render(frame(content(), null, false));
  view.rerender(frame(content("Sunny spells"), null));
  fireEvent.click(screen.getByRole("button", { name: "Hide full PDF" }));
  expect(preview).not.toHaveBeenCalled();
  expect(screen.queryByTitle("Forecast PDF preview")).toBeNull();
});

it("renders the explicit snapshot and retains it as stale after further edits", async () => {
  const snapshot = request();
  const view = render(frame(content(), snapshot));
  await screen.findByTitle("Forecast PDF preview");
  expect(preview).toHaveBeenCalledTimes(1);
  expect(preview.mock.calls[0]?.[0]).toMatchObject({
    kind: "morning",
    values: { summary: "Sunny" },
    expectedRevision: 3,
  });
  expect(screen.getByTitle("Forecast PDF preview")).toHaveAttribute(
    "src",
    "blob:preview#toolbar=0&navpanes=0&view=FitH"
  );
  view.rerender(frame(content("Edited"), snapshot));
  expect(screen.getByText("Changes pending")).toBeInTheDocument();
  expect(preview).toHaveBeenCalledTimes(1);
  view.rerender(frame(content("Edited"), snapshot, false));
  expect(screen.getByTitle("Forecast PDF preview")).not.toBeVisible();
  view.rerender(frame(content("Edited"), snapshot));
  expect(screen.getByTitle("Forecast PDF preview")).toBeVisible();
  expect(preview).toHaveBeenCalledTimes(1);
});

it("refreshes identical content when explicitly requested again and cleans up URLs", async () => {
  vi.mocked(URL.createObjectURL)
    .mockReturnValueOnce("blob:first")
    .mockReturnValueOnce("blob:second");
  const view = render(frame(content(), request()));
  await screen.findByTitle("Forecast PDF preview");
  view.rerender(frame(content(), request("Sunny", 2)));
  await waitFor(() =>
    expect(screen.getByTitle("Forecast PDF preview")).toHaveAttribute(
      "src",
      expect.stringContaining("blob:second")
    )
  );
  expect(preview).toHaveBeenCalledTimes(2);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first");
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:second");
});

it("ignores a superseded response and aborts requests on unmount", async () => {
  let resolveFirst: ((result: { ok: true; blob: Blob }) => void) | undefined;
  preview.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve;
      })
  );
  const view = render(frame(content("A"), request("A")));
  const firstSignal: AbortSignal = preview.mock.calls[0]?.[1];
  view.rerender(frame(content("B"), request("B", 2)));
  expect(firstSignal.aborted).toBe(true);
  await screen.findByTitle("Forecast PDF preview");
  await act(async () => resolveFirst?.({ ok: true, blob: new Blob(["old"]) }));
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Changes pending")).toBeNull();
  const secondSignal: AbortSignal = preview.mock.calls[1]?.[1];
  view.unmount();
  expect(secondSignal.aborted).toBe(true);
});

it("retains the last PDF on failure and offers an explicit retry", async () => {
  const view = render(frame(content(), request()));
  await screen.findByTitle("Forecast PDF preview");
  preview.mockResolvedValueOnce({
    ok: false,
    error: "Check your connection and retry.",
  });
  const retry = vi.fn();
  view.rerender(
    <ForecastPdfFrame
      content={content("Edited")}
      expanded
      onExpandedChange={vi.fn()}
      onRetry={retry}
      request={request("Edited", 2)}
    />
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Check your connection and retry."
  );
  expect(screen.getByTitle("Forecast PDF preview")).toHaveAttribute(
    "src",
    expect.stringContaining("blob:preview")
  );
  expect(screen.getByText("Changes pending")).toBeInTheDocument();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry PDF preview" }));
  expect(retry).toHaveBeenCalledTimes(1);
  view.rerender(frame(content("Edited"), request("Edited", 3)));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  await waitFor(() => expect(screen.queryByText("Changes pending")).toBeNull());
});

it("renders selected guidance from the snapshot and marks guidance edits stale", async () => {
  const guidance = {
    systems: [
      {
        id: "sys-1",
        name: "Disturbance",
        feature_type: "disturbance" as const,
        narrative: "Reviewed source",
      },
    ],
  };
  const saved: ProductContent = { kind: "outlook", values: {}, guidance };
  const snapshot: PdfPreviewRequest = {
    content: saved,
    expectedRevision: 2,
    requestId: 1,
  };
  const view = render(frame(saved, snapshot));
  await screen.findByTitle("Forecast PDF preview");
  expect(preview.mock.calls[0]?.[0].guidance).toEqual(guidance);
  view.rerender(
    frame(
      {
        ...saved,
        guidance: {
          ...guidance,
          systems: [
            {
              id: "sys-1",
              name: "Disturbance",
              feature_type: "disturbance",
              narrative: "Manual override",
            },
          ],
        },
      },
      snapshot
    )
  );
  expect(screen.getByText("Changes pending")).toBeInTheDocument();
  expect(preview).toHaveBeenCalledTimes(1);
});
