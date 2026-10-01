import { SessionUserProvider } from "@barrelsgd/auth";
import {
  emptyProduct,
  grenadaDate,
  type StoredProduct,
} from "@barrelsgd/gms/products";
import {
  render as baseRender,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ProductDesk } from "./product-desk";

const ISSUE_DATE_LABEL = /Issue date and time/;
const FORECASTER_LABEL = /Forecaster on duty/;
const AREA_LABEL = /Area covered/;
const ISSUE_SUMMARY_DATE = /^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}$/;
const SPEED_FROM_LABEL = /Speed from \(kt\)/;
const WEATHER_SUMMARY_LABEL = /Weather summary/;
const SPEED_TO_LABEL = /Speed to \(kt\)/;
const WAVES_FROM_LABEL = /Waves from \(m\)/;
const WAVES_FEET_HINT = /Waves ≈ 6 ft/;
const HIGH_TIDES_LABEL = /High tides \(times\)/;
const TIDE_TIME_LABEL = /^Tide \d time$/;
const WIND_SUMMARY_LABEL = /^Wind summary/;
const MAX_WINDS_LABEL = /Maximum winds and gusts/;

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

function render(ui: ReactElement) {
  return baseRender(
    <SessionUserProvider
      user={{
        id: "u-1",
        email: "forecaster@gms.gd",
        full_name: "Signed In Forecaster",
        is_active: true,
        is_superuser: false,
      }}
    >
      {ui}
    </SessionUserProvider>
  );
}
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

it("shows a tab per forecast kind and switches when the form is clean", async () => {
  render(
    <ProductDesk kinds={["morning", "midday", "evening"]} title="Forecasts" />
  );
  const tabs = screen.getAllByRole("tab");
  expect(tabs).toHaveLength(3);
  expect(screen.getByRole("tab", { name: "Morning" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Validate and preview" })
    ).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("tab", { name: "Midday" }));
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Midday" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  );
  expect(actions.loadProductsAction).toHaveBeenCalledWith(
    undefined,
    undefined,
    0
  );
  expect(screen.getByText("Issued").nextElementSibling).toHaveTextContent(
    "12:00"
  );
});

it("asks before switching tabs with unsaved changes", async () => {
  render(
    <ProductDesk kinds={["morning", "midday", "evening"]} title="Forecasts" />
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Validate and preview" })
    ).toBeEnabled()
  );
  const textarea = screen
    .getAllByRole("textbox")
    .find((el) => el.tagName === "TEXTAREA" && el.id !== "change-summary");
  if (!textarea) throw new Error("expected a forecast textarea");
  fireEvent.change(textarea, { target: { value: "Edited" } });
  fireEvent.click(screen.getByRole("tab", { name: "Evening" }));
  expect(
    await screen.findByText("Discard unsaved changes?")
  ).toBeInTheDocument();
  expect(
    screen.getByRole("tab", { hidden: true, name: "Morning" })
  ).toHaveAttribute("aria-selected", "true");
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Evening" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  );
});

it("hides the tab bar for a single product kind", async () => {
  await openEditor();
  expect(screen.queryByRole("tablist")).toBeNull();
});

it("uses today's fixed forecast slot without redundant date controls", async () => {
  await openEditor();
  expect(screen.queryByLabelText("Forecast / issue date")).toBeNull();
  expect(document.getElementById("desk-time")).toBeNull();
  expect(screen.queryByLabelText("Saved forecast date")).toBeNull();
  const issued = screen.getByText("Issued").nextElementSibling?.textContent;
  expect(issued).toContain("07:00");
});

it("keeps bulletin issue timing editable without duplicate desk controls", async () => {
  render(<ProductDesk kinds={["marine"]} title="Bulletins" />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Validate and preview" })
    ).toBeEnabled()
  );
  expect(screen.queryByLabelText("Forecast / issue date")).toBeNull();
  expect(document.getElementById("desk-time")).toBeNull();
  const issue = screen.getByLabelText(ISSUE_DATE_LABEL);
  fireEvent.change(issue, { target: { value: "2026-09-30T08:30" } });
  expect(issue).toHaveValue("2026-09-30T08:30");
});

it("pages through the archive without filtering by the active editor", async () => {
  const products: StoredProduct[] = Array.from({ length: 50 }, (_, index) => ({
    id: `product-${index}`,
    kind: "marine",
    values: { issuedAt: "2026-01-01T05:00" },
    revision: 1,
    publishedRevision: null,
    updatedAt: "2026-01-01T09:00:00Z",
  }));
  actions.loadProductsAction
    .mockResolvedValueOnce({ ok: true, products })
    .mockResolvedValueOnce({ ok: true, products: [] });
  await openEditor();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(actions.loadProductsAction).toHaveBeenLastCalledWith(
      undefined,
      undefined,
      50
    )
  );
  await screen.findByText("No saved products on this page.");
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
});

it("opens older products across kinds from the shared archive and starts new forecasts today", async () => {
  const archived: StoredProduct = {
    id: "7d517fe0-a25b-4f12-a2b4-eaaed8116010",
    kind: "evening",
    values: emptyProduct("evening", "2026-01-01"),
    revision: 1,
    publishedRevision: null,
    updatedAt: "2026-01-01T22:00:00Z",
  };
  actions.loadProductsAction.mockResolvedValue({
    ok: true,
    products: [archived],
  });
  render(<ProductDesk kinds={["marine", "cyclone"]} title="Bulletins" />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Open Evening Forecast 2026-01-01T18:00",
    })
  );
  expect(screen.getByRole("tab", { name: "Evening" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  expect(screen.getByText("Issued").nextElementSibling).toHaveTextContent(
    "1 Jan 2026, 18:00"
  );
  fireEvent.click(screen.getByRole("button", { name: "New Evening Forecast" }));
  actions.saveProductAction.mockResolvedValue({
    ok: false,
    error: "Test draft not persisted",
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(actions.saveProductAction).toHaveBeenCalled());
  expect(actions.saveProductAction.mock.calls[0][0].values.issuedAt).toBe(
    `${grenadaDate()}T18:00`
  );
});

it("shows scheduled and fixed issue details as text, not fields", async () => {
  await openEditor();
  expect(screen.queryByLabelText(ISSUE_DATE_LABEL)).toBeNull();
  expect(screen.queryByLabelText(FORECASTER_LABEL)).toBeNull();
  expect(screen.queryByLabelText(AREA_LABEL)).toBeNull();
  expect(screen.getByText("Signed In Forecaster")).toBeInTheDocument();
  expect(
    screen.getByText("Grenada, Carriacou and Petite Martinique")
  ).toBeInTheDocument();
  expect(screen.getByText(ISSUE_SUMMARY_DATE)).toBeInTheDocument();
});

it("sizes structured inputs and hints converted units", async () => {
  await openEditor();
  const speed = screen.getByLabelText(SPEED_FROM_LABEL);
  expect(speed.closest("[data-slot=field]")).toHaveClass("w-28");
  expect(
    screen.getByLabelText(WEATHER_SUMMARY_LABEL).closest("[data-slot=field]")
  ).toHaveClass("basis-full");
  fireEvent.change(speed, { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText(SPEED_TO_LABEL), {
    target: { value: "20" },
  });
  expect(screen.getByText("≈ 12–23 mph · 19–37 km/h")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(WAVES_FROM_LABEL), {
    target: { value: "1.8" },
  });
  expect(screen.getByText(WAVES_FEET_HINT)).toBeInTheDocument();
  expect(screen.queryByLabelText(HIGH_TIDES_LABEL)).toBeNull();
});

it("adds and removes tide rows, shifting later tides up", async () => {
  await openEditor();
  expect(screen.getAllByLabelText(TIDE_TIME_LABEL)).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Add tide" }));
  fireEvent.change(screen.getByLabelText("Tide 2 time"), {
    target: { value: "18:40" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove tide 1" }));
  expect(screen.getAllByLabelText(TIDE_TIME_LABEL)).toHaveLength(1);
  expect(screen.getByLabelText("Tide 1 time")).toHaveValue("18:40");
});

it("gives marine bulletins structured wind while cyclones keep free text", async () => {
  const view = render(
    <ProductDesk kinds={["marine", "cyclone"]} title="Bulletins" />
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Validate and preview" })
    ).toBeEnabled()
  );
  expect(screen.getByLabelText(SPEED_FROM_LABEL)).toBeInTheDocument();
  expect(screen.queryByLabelText(WIND_SUMMARY_LABEL)).toBeNull();
  expect(screen.queryByLabelText(FORECASTER_LABEL)).toBeNull();
  expect(screen.getByText("Signed In Forecaster")).toBeInTheDocument();
  expect(screen.getByLabelText(AREA_LABEL)).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("tab", { name: "Tropical Cyclone Bulletin" })
  );
  expect(await screen.findByLabelText(MAX_WINDS_LABEL)).toBeInTheDocument();
  view.unmount();
});
