import { SessionUserProvider } from "@barrelsgd/auth";
import type { ProductKind, ProductValues } from "@barrelsgd/gms/products";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ProductDesk } from "./product-desk";

const WEATHER_SUMMARY_LABEL = /Weather summary/;

const actions = vi.hoisted(() => ({
  loadProductsAction: vi.fn(),
  loadProductHistoryAction: vi.fn(),
  previewProductAction: vi.fn(),
  previewProductPdfAction: vi.fn(),
  saveProductAction: vi.fn(),
  downloadProductPdfAction: vi.fn(),
}));
vi.mock("@/app/(admin)/wxproducts/product-actions", () => actions);
vi.mock("./cap-forecast-picker", () => ({ CapForecastPicker: () => null }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  actions.loadProductsAction.mockResolvedValue({ ok: true, products: [] });
  actions.previewProductPdfAction.mockResolvedValue({
    ok: true,
    blob: new Blob(["%PDF"]),
  });
  actions.previewProductAction.mockImplementation(
    async ({ values }: { values: ProductValues }) => ({
      ok: true,
      preview: {
        values: { ...values, summary: "Normalized forecast" },
        errors: [],
      },
    })
  );
  actions.saveProductAction.mockImplementation(
    async ({
      values,
      id,
      kind,
    }: {
      values: ProductValues;
      id: string;
      kind: ProductKind;
    }) => ({
      ok: true,
      product: {
        id,
        kind,
        values: { ...values, summary: "Saved forecast" },
        revision: 1,
        publishedRevision: null,
        updatedAt: "2026-10-12T12:00:00Z",
      },
    })
  );
  URL.createObjectURL = vi.fn(() => "blob:forecast");
  URL.revokeObjectURL = vi.fn();
});

async function openEditor() {
  render(
    <SessionUserProvider
      user={{
        id: "user-1",
        email: "forecaster@example.com",
        full_name: "Duty Forecaster",
        is_active: true,
        is_superuser: false,
      }}
    >
      <ProductDesk kinds={["morning"]} title="Forecasts" />
    </SessionUserProvider>
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Validate and preview" })
    ).toBeEnabled()
  );
  return screen.getByLabelText(WEATHER_SUMMARY_LABEL);
}

it("updates the live summary without rendering and explicitly previews without saving or validating", async () => {
  const summary = await openEditor();
  expect(actions.previewProductPdfAction).not.toHaveBeenCalled();
  fireEvent.change(summary, { target: { value: "Sunny spells" } });
  expect(
    within(screen.getByRole("region", { name: "Product summary" })).getByText(
      "Sunny spells"
    )
  ).toBeInTheDocument();
  expect(actions.previewProductPdfAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Show full PDF" }));
  expect(actions.previewProductPdfAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Preview PDF" }));
  expect(await screen.findByTitle("Forecast PDF preview")).toBeVisible();
  expect(actions.previewProductPdfAction).toHaveBeenCalledWith(
    expect.objectContaining({
      values: expect.objectContaining({ summary: "Sunny spells" }),
      expectedRevision: 0,
    }),
    expect.any(AbortSignal)
  );
  expect(actions.saveProductAction).not.toHaveBeenCalled();
  expect(actions.previewProductAction).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Publish to GMS" })).toBeNull();
  fireEvent.change(summary, { target: { value: "Rain later" } });
  expect(screen.getByText("Changes pending")).toBeInTheDocument();
  expect(actions.previewProductPdfAction).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Preview PDF" }));
  await waitFor(() => expect(screen.queryByText("Changes pending")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Preview PDF" }));
  await waitFor(() =>
    expect(actions.previewProductPdfAction).toHaveBeenCalledTimes(3)
  );
});

it("refreshes a saved draft with returned values and revision without opening the panel", async () => {
  await openEditor();
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft saved.");
  await waitFor(() =>
    expect(actions.previewProductPdfAction).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ summary: "Saved forecast" }),
        expectedRevision: 1,
      }),
      expect.any(AbortSignal)
    )
  );
  expect(screen.getByTitle("Forecast PDF preview")).not.toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Show full PDF" }));
  expect(screen.getByTitle("Forecast PDF preview")).toBeVisible();
  expect(actions.previewProductPdfAction).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(actions.previewProductPdfAction).toHaveBeenCalledTimes(2)
  );
  expect(screen.getByTitle("Forecast PDF preview")).toBeVisible();
});

it("opens the normalized PDF after validation and preserves the publication review gate", async () => {
  const summary = await openEditor();
  fireEvent.click(screen.getByRole("button", { name: "Validate and preview" }));
  expect(await screen.findByTitle("Forecast PDF preview")).toBeVisible();
  expect(actions.previewProductPdfAction).toHaveBeenCalledWith(
    expect.objectContaining({
      values: expect.objectContaining({ summary: "Normalized forecast" }),
    }),
    expect.any(AbortSignal)
  );
  expect(screen.getByRole("button", { name: "Publish to GMS" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "Publish to GMS" })).toBeEnabled();
  fireEvent.change(summary, { target: { value: "Edited forecast" } });
  expect(screen.queryByRole("button", { name: "Publish to GMS" })).toBeNull();
  expect(screen.getByText("Changes pending")).toBeInTheDocument();
  expect(actions.previewProductPdfAction).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Validate and preview" }));
  await waitFor(() =>
    expect(actions.previewProductPdfAction).toHaveBeenCalledTimes(2)
  );
  expect(screen.getByRole("checkbox")).not.toBeChecked();
});

it("does not replace a PDF on validation or save failure, and keeps save success when rendering fails", async () => {
  await openEditor();
  fireEvent.click(screen.getByRole("button", { name: "Preview PDF" }));
  await screen.findByTitle("Forecast PDF preview");
  actions.previewProductAction.mockResolvedValueOnce({
    ok: true,
    preview: { values: {}, errors: ["Missing required fields"] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Validate and preview" }));
  await screen.findByText("Missing required fields");
  expect(actions.previewProductPdfAction).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled()
  );
  actions.saveProductAction.mockResolvedValueOnce({
    ok: false,
    error: "Save unavailable",
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Save unavailable");
  expect(actions.previewProductPdfAction).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled()
  );
  actions.previewProductPdfAction.mockResolvedValueOnce({
    ok: false,
    error: "PDF unavailable",
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft saved.");
  expect(await screen.findByRole("alert")).toHaveTextContent("PDF unavailable");
  expect(screen.getByTitle("Forecast PDF preview")).toBeVisible();
  expect(screen.getByText("Changes pending")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry PDF preview" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  await waitFor(() => expect(screen.queryByText("Changes pending")).toBeNull());
  expect(actions.saveProductAction).toHaveBeenCalledTimes(2);
});
