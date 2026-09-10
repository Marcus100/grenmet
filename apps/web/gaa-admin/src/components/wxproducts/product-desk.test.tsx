import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  history: vi.fn(),
}));
vi.mock("@/app/(admin)/wxproducts/product-actions", () => ({
  loadProductsAction: actions.load,
  saveProductAction: actions.save,
  loadProductHistoryAction: actions.history,
}));

import { ProductDesk } from "./product-desk";

beforeEach(() => {
  vi.resetAllMocks();
  actions.load.mockResolvedValue({ ok: true, products: [] });
  actions.save.mockResolvedValue({ ok: false, error: "Storage unavailable" });
});
describe("product desk", () => {
  it("allows saving an incomplete draft but validates before exposing publication", async () => {
    render(<ProductDesk kinds={["marine"]} title="Bulletins" />);
    await screen.findByText("No saved products of this type.");
    fireEvent.click(
      screen.getByRole("button", { name: "Validate and preview" })
    );
    expect(
      screen.queryByRole("button", { name: "Publish to GMS" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Synopsis is required"
    );
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(actions.save).toHaveBeenCalledWith(
        expect.objectContaining({ action: "draft", reviewed: false })
      )
    );
    await screen.findByText("Storage unavailable");
  });
  it("provides four dated days and an evening issue at 18:00", async () => {
    render(<ProductDesk kinds={["evening"]} title="Impact-Based Forecasts" />);
    await screen.findByText("No saved products of this type.");
    expect(screen.getByRole("heading", { name: "Day 4" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Day 5" })
    ).not.toBeInTheDocument();
    const date = screen.getByLabelText("Forecast / issue date");
    await act(async () => {
      fireEvent.change(date, { target: { value: "2026-09-08" } });
      await actions.load.mock.results.at(-1)?.value;
    });
    expect(
      screen.getByLabelText("Issue date and time (Grenada) *")
    ).toHaveValue("2026-09-08T18:00");
    expect(document.getElementById("evening-day4Date")).toHaveValue(
      "2026-09-12"
    );
  });
});
