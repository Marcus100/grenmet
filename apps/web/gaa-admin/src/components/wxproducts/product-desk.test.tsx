import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ProductDesk } from "./product-desk";

const actions = vi.hoisted(() => ({
  loadProductsAction: vi.fn(),
  loadProductHistoryAction: vi.fn(),
  previewProductAction: vi.fn(),
  saveProductAction: vi.fn(),
}));
vi.mock("@/app/(admin)/wxproducts/product-actions", () => actions);
vi.mock("./cap-forecast-picker", () => ({ CapForecastPicker: () => null }));
vi.mock("@/components/wxproducts/product-pdf-preview", () => ({
  ProductPdfPreview: () => null,
}));
vi.mock("@barrelsgd/gms/components/product-content", () => ({
  ProductContentView: ({
    content,
  }: {
    content: { values: Record<string, string> };
  }) => <p>{content.values.summary}</p>,
}));

beforeEach(() => {
  vi.resetAllMocks();
  actions.loadProductsAction.mockResolvedValue({ ok: true, products: [] });
});
async function openEditor() {
  render(<ProductDesk kinds={["morning"]} title="Forecasts" />);
  const button = await screen.findByRole("button", {
    name: "Validate and preview",
  });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}
it("reviews the backend's normalized content and invalidates it after editing", async () => {
  actions.previewProductAction.mockImplementation(async ({ values }) => ({
    ok: true,
    preview: {
      values: { ...values, summary: "Backend normalized forecast" },
      errors: [],
      checked_at: "2026-09-17T12:00:00Z",
    },
  }));
  fireEvent.click(await openEditor());
  const region = await screen.findByRole("region", {
    name: "Publication preview",
  });
  expect(region).toHaveTextContent("Backend normalized forecast");
  expect(screen.getByRole("button", { name: "Publish to GMS" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "Publish to GMS" })).toBeEnabled();
  fireEvent.change(screen.getByDisplayValue("Backend normalized forecast"), {
    target: { value: "Edited forecast" },
  });
  expect(
    screen.queryByRole("region", { name: "Publication preview" })
  ).toBeNull();
  expect(actions.saveProductAction).not.toHaveBeenCalled();
});
it("shows backend validation errors without offering publication", async () => {
  actions.previewProductAction.mockResolvedValue({
    ok: true,
    preview: {
      values: {},
      errors: ["An expired product cannot be published"],
      checked_at: "2026-09-17T12:00:00Z",
    },
  });
  fireEvent.click(await openEditor());
  await screen.findByText("An expired product cannot be published");
  expect(screen.queryByRole("button", { name: "Publish to GMS" })).toBeNull();
});
it("does not offer publication when preview is unavailable", async () => {
  actions.previewProductAction.mockResolvedValue({
    ok: false,
    error: "Preview unavailable",
  });
  fireEvent.click(await openEditor());
  await screen.findByText("Preview unavailable");
  expect(screen.queryByRole("button", { name: "Publish to GMS" })).toBeNull();
});
