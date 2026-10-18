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
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ProductDesk } from "./product-desk";

const PUBLICATION_CONFIRMATION = /checked the content/;

const OPEN_MARINE = /^Open Marine/;
const ISSUE_DATE_LABEL = /Issue date and time/;
const FORECASTER_LABEL = /Forecaster on duty/;
const AREA_LABEL = /Area covered/;
const SPEED_FROM_LABEL = /Speed from \(mph\)/;
const WEATHER_SUMMARY_LABEL = /^Weather summary \*$/;
const SPEED_TO_LABEL = /Speed to \(mph\)/;
const WAVES_FROM_LABEL = /Waves from \(ft\)/;
const WAVES_METRES_HINT = /Waves ≈ 0.55 m/;
const HIGH_TIDES_LABEL = /High tides \(times\)/;
const TIDE_TIME_LABEL = /^Tide \d time$/;
const WIND_SUMMARY_LABEL = /^Wind summary/;
const MAX_WINDS_LABEL = /Maximum winds and gusts/;
const DAY_ONE_HEADING = /^Day 1/;
const EVENT_TIME_LABEL = /Event date and time/;
const FIELD_LIMIT_ERROR = /forecast field limit/;
const REVISION_TWO_LINE =
  /Revision 2 · publish · Ann Forecaster · 2026-10-07T12:00:00Z/;
const REVISION_ONE_LINE =
  /Revision 1 · save · Ann Forecaster · 2026-10-07T11:00:00Z/;

const actions = vi.hoisted(() => ({
  loadProductsAction: vi.fn(),
  loadProductHistoryAction: vi.fn(),
  previewProductAction: vi.fn(),
  saveProductAction: vi.fn(),
  previewProductPdfAction: vi.fn(),
  downloadProductPdfAction: vi.fn(),
}));
vi.mock("@/app/(admin)/wxproducts/product-actions", () => actions);
const picker = vi.hoisted(() => ({ expose: false }));
// Renders nothing unless a test opts in, so existing tests are unaffected. When
// exposed it behaves like the real picker: it reports an insert error instead of
// throwing out of the click handler.
vi.mock("./cap-forecast-picker", async () => {
  const { useState } = await import("react");
  return {
    CapForecastPicker: ({
      onInsert,
      targets,
    }: {
      onInsert: (target: string, text: string) => void;
      targets: { value: string }[];
    }) => {
      const [error, setError] = useState("");
      if (!picker.expose) return null;
      const insert = (text: string) => {
        try {
          onInsert(targets[0]?.value ?? "summary", text);
          setError("");
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      };
      return (
        <div>
          <button onClick={() => insert("CAP wording")} type="button">
            Insert CAP wording
          </button>
          <button onClick={() => insert("x".repeat(12_001))} type="button">
            Insert oversized CAP text
          </button>
          {error ? <p role="alert">{error}</p> : null}
        </div>
      );
    },
  };
});
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
  picker.expose = false;
  vi.resetAllMocks();
  actions.loadProductsAction.mockResolvedValue({ ok: true, products: [] });
  actions.previewProductPdfAction.mockResolvedValue({
    ok: true,
    blob: new Blob(["%PDF"]),
  });
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
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
  fireEvent.click(
    screen.getByRole("checkbox", { name: PUBLICATION_CONFIRMATION })
  );
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
  expect(
    screen.getByText("Issued (Grenada time)").nextElementSibling
  ).toHaveTextContent("12:00");
});

it("uses compact alert tab names and opens the existing earthquake and tsunami editor", async () => {
  render(
    <ProductDesk
      kinds={[
        "outlook",
        "cyclone",
        "marine",
        "flood",
        "thunderstorm",
        "wind",
        "heat",
        "dust",
        "coastal",
        "tsunami",
      ]}
      title="Alerts"
    />
  );
  const tabs = within(screen.getByRole("tablist", { name: "Product type" }));
  expect(tabs.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
    "Tropical Weather Outlook",
    "Tropical Cyclone",
    "Marine / Small Craft",
    "Flood / Heavy Rain",
    "Thunderstorm",
    "Wind",
    "Heat",
    "Dust / Haze",
    "Coastal Hazard",
    "Tsunami / Earthquake",
  ]);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Validate and preview" })
    ).toBeEnabled()
  );
  fireEvent.click(tabs.getByRole("tab", { name: "Tsunami / Earthquake" }));
  await waitFor(() =>
    expect(
      screen.getByRole("tab", { name: "Tsunami / Earthquake" })
    ).toHaveAttribute("aria-selected", "true")
  );
  expect(screen.getByLabelText(EVENT_TIME_LABEL)).toBeInTheDocument();
  expect(actions.saveProductAction).not.toHaveBeenCalled();
});

it("keeps evening periods in subtabs without losing edits or rendering PDFs", async () => {
  render(<ProductDesk kinds={["evening"]} title="Forecasts" />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled()
  );
  const tonight = screen.getByRole("tabpanel", { name: "Tonight" });
  const periodTabs = screen.getByRole("tablist", {
    name: "Evening forecast period",
  });
  expect(
    periodTabs.compareDocumentPosition(screen.getByText("New draft"))
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  fireEvent.change(within(tonight).getByLabelText("Tonight's weather *"), {
    target: { value: "Tonight draft" },
  });
  fireEvent.click(screen.getByRole("tab", { name: "Day 1" }));
  const day1 = screen.getByRole("tabpanel", { name: "Day 1" });
  expect(
    within(day1).queryByRole("heading", { name: DAY_ONE_HEADING })
  ).toBeNull();
  expect(screen.queryByRole("region", { name: "Weather fields" })).toBeNull();
  fireEvent.change(within(day1).getByLabelText("Weather *", { exact: true }), {
    target: { value: "Day one draft" },
  });
  fireEvent.change(within(day1).getByLabelText(SPEED_FROM_LABEL), {
    target: { value: "10" },
  });
  fireEvent.click(screen.getByRole("tab", { name: "Day 2" }));
  fireEvent.change(
    within(screen.getByRole("tabpanel", { name: "Day 2" })).getByLabelText(
      "Weather *",
      { exact: true }
    ),
    { target: { value: "Day two draft" } }
  );
  fireEvent.click(screen.getByRole("tab", { name: "Day 1" }));
  expect(
    within(screen.getByRole("tabpanel", { name: "Day 1" })).getByLabelText(
      "Weather *",
      { exact: true }
    )
  ).toHaveValue("Day one draft");
  expect(
    within(screen.getByRole("tabpanel", { name: "Day 1" })).getByLabelText(
      SPEED_FROM_LABEL
    )
  ).toHaveValue(10);
  fireEvent.click(screen.getByRole("tab", { name: "Tonight" }));
  expect(screen.getByLabelText("Tonight's weather *")).toHaveValue(
    "Tonight draft"
  );
  expect(actions.previewProductPdfAction).not.toHaveBeenCalled();
  actions.saveProductAction.mockResolvedValue({
    ok: false,
    error: "Not persisted",
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(actions.saveProductAction).toHaveBeenCalledOnce());
  const saved = actions.saveProductAction.mock.calls[0]?.[0]?.values;
  expect(saved.summary).toBe("Tonight draft");
  expect(saved.day1Weather).toBe("Day one draft");
  expect(saved.day2Weather).toBe("Day two draft");
  expect(Number(saved.day1WindSpeedMin)).toBeCloseTo(
    10 / (1852 / 1609.344),
    10
  );
});

it("preserves publication review when switching evening periods and invalidates it after a day edit", async () => {
  actions.previewProductAction.mockImplementation(async ({ values }) => ({
    ok: true,
    preview: { values, errors: [], checked_at: "2026-10-12T22:00:00Z" },
  }));
  render(<ProductDesk kinds={["evening"]} title="Forecasts" />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Validate and preview" })
    ).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "Validate and preview" }));
  await screen.findByRole("region", { name: "Publication preview" });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("tab", { name: "Day 2" }));
  expect(screen.getByRole("button", { name: "Publish to GMS" })).toBeEnabled();
  fireEvent.change(
    within(screen.getByRole("tabpanel", { name: "Day 2" })).getByLabelText(
      "Weather *",
      { exact: true }
    ),
    { target: { value: "Edited day two" } }
  );
  expect(
    screen.queryByRole("region", { name: "Publication preview" })
  ).toBeNull();
  expect(actions.previewProductPdfAction).toHaveBeenCalledOnce();
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
  const issued = screen.getByText("Issued (Grenada time)").nextElementSibling
    ?.textContent;
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
  expect(
    screen.getByText("Issued (Grenada time)").nextElementSibling
  ).toHaveTextContent("2026-01-01 18:00");
  fireEvent.click(screen.getByRole("button", { name: "New Evening Forecast" }));
  actions.saveProductAction.mockResolvedValue({
    ok: false,
    error: "Test draft not persisted",
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(actions.saveProductAction).toHaveBeenCalled());
  expect(actions.saveProductAction.mock.calls[0]?.[0]?.values.issuedAt).toBe(
    `${grenadaDate()}T18:00`
  );
});

it("starts a new forecast from the last issued one without carrying over its timing or forecaster", async () => {
  const last: StoredProduct = {
    id: "9a517fe0-a25b-4f12-a2b4-eaaed8116011",
    kind: "morning",
    values: {
      ...emptyProduct("morning", "2026-01-01"),
      forecaster: "Previous Forecaster",
      summary: "Showers over the northern parishes.",
    },
    revision: 2,
    publishedRevision: 2,
    updatedAt: "2026-01-01T11:00:00Z",
  };
  const draftOnly: StoredProduct = {
    ...last,
    id: "9a517fe0-a25b-4f12-a2b4-eaaed8116012",
    values: { ...last.values, summary: "Unpublished draft wording" },
    publishedRevision: null,
    updatedAt: "2026-01-02T11:00:00Z",
  };
  actions.loadProductsAction.mockResolvedValue({
    ok: true,
    products: [draftOnly, last],
  });
  render(<ProductDesk kinds={["morning"]} title="Forecasts" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Start from last issued" })
  );
  expect(screen.getByLabelText(WEATHER_SUMMARY_LABEL)).toHaveValue(
    "Showers over the northern parishes."
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Copied from the last issued"
  );
  actions.saveProductAction.mockResolvedValue({
    ok: false,
    error: "Test draft not persisted",
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(actions.saveProductAction).toHaveBeenCalled());
  const saved = actions.saveProductAction.mock.calls[0]?.[0]?.values;
  expect(saved.issuedAt).toBe(`${grenadaDate()}T07:00`);
  expect(saved.forecaster).toBe("Signed In Forecaster");
});

it("does not offer to copy the last issued hazard bulletin", async () => {
  actions.loadProductsAction.mockResolvedValue({
    ok: true,
    products: [
      {
        id: "9a517fe0-a25b-4f12-a2b4-eaaed8116013",
        kind: "marine",
        values: emptyProduct("marine", "2026-01-01"),
        revision: 1,
        publishedRevision: 1,
        updatedAt: "2026-01-01T11:00:00Z",
      },
    ],
  });
  render(<ProductDesk kinds={["marine"]} title="Bulletins" />);
  await screen.findByRole("button", { name: "Load example draft" });
  expect(
    screen.queryByRole("button", { name: "Start from last issued" })
  ).toBeNull();
});

it("shows scheduled and fixed issue details only in the text preview", async () => {
  await openEditor();
  expect(screen.queryByLabelText(ISSUE_DATE_LABEL)).toBeNull();
  expect(screen.queryByLabelText(FORECASTER_LABEL)).toBeNull();
  expect(screen.queryByLabelText(AREA_LABEL)).toBeNull();
  expect(screen.getByText("Signed In Forecaster")).toBeInTheDocument();
  expect(
    screen.getByText("Grenada, Carriacou and Petite Martinique")
  ).toBeInTheDocument();
  expect(
    screen.getByText("Issued (Grenada time)").nextElementSibling
  ).toHaveTextContent(`${grenadaDate()} 07:00`);
  expect(screen.queryByText("Issued", { exact: true })).toBeNull();
  expect(screen.queryByText("Valid", { exact: true })).toBeNull();
  expect(screen.queryByText("Area", { exact: true })).toBeNull();
});

it("uses compact wind and astronomy rows with preferred units and canonical saves", async () => {
  await openEditor();
  const speed = screen.getByLabelText(SPEED_FROM_LABEL);
  const wind = screen.getByRole("region", { name: "Wind fields" });
  expect(speed.closest("[data-slot=field]")).toHaveClass("w-24");
  expect(speed.closest("[data-slot=field]")?.parentElement).toHaveClass(
    "flex-wrap"
  );
  expect(wind).not.toHaveClass("rounded-lg", "p-4");
  const astronomy = screen.getByRole("region", { name: "Astronomy fields" });
  const sunrise = within(astronomy).getByLabelText("Sunrise");
  const sunset = within(astronomy).getByLabelText("Sunset");
  expect(sunrise.closest("[data-slot=field]")?.parentElement).toHaveClass(
    "grid-cols-2"
  );
  expect(sunrise.closest("[data-slot=field]")?.parentElement).toBe(
    sunset.closest("[data-slot=field]")?.parentElement
  );
  expect(
    screen.getByLabelText(WEATHER_SUMMARY_LABEL).closest("[data-slot=field]")
  ).toHaveClass("basis-full");
  fireEvent.change(speed, { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText(SPEED_TO_LABEL), {
    target: { value: "20" },
  });
  expect(screen.getByText("≈ 9–17 kt · 16–32 km/h")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(WAVES_FROM_LABEL), {
    target: { value: "1.8" },
  });
  expect(screen.getByText(WAVES_METRES_HINT)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Tide 1 height (ft)"), {
    target: { value: "1" },
  });
  expect(
    screen.getByLabelText("Minimum temperature (°C) *")
  ).toBeInTheDocument();
  const min = screen.getByLabelText("Minimum temperature (°C) *");
  expect(min).toHaveAttribute("placeholder", "Min temp");
  fireEvent.change(min, { target: { value: "24" } });
  expect(min.closest("[data-slot=field]")).toHaveTextContent("Min temp");
  expect(min.closest("[data-slot=field]")).toHaveAttribute(
    "data-orientation",
    "horizontal"
  );
  expect(min.closest("[data-slot=input-group]")).toHaveTextContent("°C");
  expect(min.closest("[data-slot=input-group]")).toHaveTextContent("*");
  const visibleLabel = min
    .closest("[data-slot=field]")
    ?.querySelector("label > span[aria-hidden]");
  expect(visibleLabel).toBeNull();
  expect(min.closest("[data-slot=input-group]")).toHaveTextContent("Min temp");
  expect(sunrise).toHaveAttribute("placeholder", "Sunrise");
  expect(screen.getByLabelText("Term")).toHaveAttribute("placeholder", "Term");
  expect(screen.getByLabelText("Meaning")).toHaveAttribute(
    "placeholder",
    "Meaning"
  );
  expect(screen.getByLabelText(WEATHER_SUMMARY_LABEL)).toBeVisible();
  const weather = screen.getByRole("region", { name: "Weather fields" });
  const weatherControls = [
    ...weather.querySelectorAll("input, button, textarea"),
  ];
  expect(weatherControls.at(-1)).toBe(
    screen.getByLabelText(WEATHER_SUMMARY_LABEL)
  );
  const marine = screen.getByRole("region", { name: "Marine fields" });
  expect(marine.querySelector("textarea")).toBeNull();
  expect(screen.queryByLabelText(HIGH_TIDES_LABEL)).toBeNull();
  actions.saveProductAction.mockResolvedValue({
    ok: false,
    error: "Not persisted",
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(actions.saveProductAction).toHaveBeenCalledOnce());
  const saved = actions.saveProductAction.mock.calls[0]?.[0]?.values;
  expect(Number(saved.windSpeedMin)).toBeCloseTo(10 / (1852 / 1609.344), 10);
  expect(Number(saved.waveHeightMin)).toBeCloseTo(1.8 * 0.3048, 10);
  expect(Number(saved.tide1Height)).toBeCloseTo(0.3048, 10);
  expect(saved.minTemperature).toBe("24");
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
  fireEvent.click(screen.getByRole("tab", { name: "Tropical Cyclone" }));
  expect(await screen.findByLabelText(MAX_WINDS_LABEL)).toBeInTheDocument();
  view.unmount();
});

it("validates and publishes a bulletin after saving its draft", async () => {
  actions.saveProductAction.mockImplementation(async (input) => ({
    ok: true,
    product: {
      id: input.id,
      kind: input.kind,
      values: { ...input.values, synopsis: "Saved bulletin" },
      revision: input.expectedRevision + 1,
      publishedRevision:
        input.action === "publish" ? input.expectedRevision + 1 : null,
      updatedAt: "2026-10-07T12:00:00Z",
    },
  }));
  actions.previewProductAction.mockImplementation(async ({ values }) => ({
    ok: true,
    preview: { values, errors: [], checked_at: "2026-10-07T12:00:00Z" },
  }));
  render(<ProductDesk kinds={["marine"]} title="Bulletins" />);
  const save = screen.getByRole("button", { name: "Save draft" });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  await screen.findByText("Draft saved.");
  const validate = screen.getByRole("button", { name: "Validate and preview" });
  await waitFor(() => expect(validate).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Issue / revision note"), {
    target: { value: "Initial issue" },
  });
  fireEvent.click(validate);
  await screen.findByRole("region", { name: "Publication preview" });
  fireEvent.click(
    screen.getByRole("checkbox", { name: PUBLICATION_CONFIRMATION })
  );
  fireEvent.click(screen.getByRole("button", { name: "Publish to GMS" }));
  await waitFor(() =>
    expect(actions.saveProductAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "publish",
        expectedRevision: 1,
        reviewed: true,
      })
    )
  );
});

it("shows saved-draft validation errors beside the publication controls", async () => {
  actions.loadProductsAction.mockResolvedValue({
    ok: true,
    products: [
      {
        id: "7d517fe0-a25b-4f12-a2b4-eaaed8116010",
        kind: "marine",
        values: emptyProduct("marine", grenadaDate()),
        revision: 1,
        publishedRevision: null,
        updatedAt: "2026-10-07T12:00:00Z",
      },
    ],
  });
  actions.previewProductAction.mockResolvedValue({
    ok: true,
    preview: {
      values: {},
      errors: ["Describe this issue or revision"],
      checked_at: "2026-10-07T12:00:00Z",
    },
  });
  render(<ProductDesk kinds={["marine"]} title="Bulletins" />);
  fireEvent.click(await screen.findByRole("button", { name: OPEN_MARINE }));
  const validate = screen.getByRole("button", { name: "Validate and preview" });
  fireEvent.click(validate);
  const message = await screen.findByText("Describe this issue or revision");
  expect(validate.closest("form")).toContainElement(message);
  expect(
    screen.getByLabelText("Issue / revision note")
  ).toHaveAccessibleDescription(
    "Required to validate and publish a saved draft, including its first publication."
  );
  expect(screen.queryByRole("button", { name: "Publish to GMS" })).toBeNull();
});

it("snapshots reviewed guidance and requires a fresh review after a system edit", async () => {
  actions.previewProductAction.mockImplementation(
    async ({ values, guidance }) => ({
      ok: true,
      preview: {
        values,
        guidance,
        errors: [],
        checked_at: "2026-10-12T12:00:00Z",
      },
    })
  );
  actions.saveProductAction.mockImplementation(
    async ({ id, kind, values, guidance }) => ({
      ok: true,
      product: {
        id,
        kind,
        values,
        guidance: {
          ...guidance,
          local_assessment: "Canonical saved assessment",
        },
        revision: 1,
        publishedRevision: null,
        updatedAt: "2026-10-12T12:00:00Z",
      },
    })
  );
  render(<ProductDesk kinds={["outlook"]} title="Alerts" />);
  const validate = screen.getByRole("button", { name: "Validate and preview" });
  await waitFor(() => expect(validate).toBeEnabled());
  fireEvent.click(
    screen.getByRole("button", { name: "Add meteorological system" })
  );
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Eastern wave" },
  });
  fireEvent.change(screen.getByLabelText("System narrative"), {
    target: { value: "Reviewed wave analysis" },
  });
  fireEvent.click(validate);
  await screen.findByRole("region", { name: "Publication preview" });
  await waitFor(() =>
    expect(actions.previewProductPdfAction).toHaveBeenCalledWith(
      expect.objectContaining({
        guidance: expect.objectContaining({
          systems: [
            expect.objectContaining({ narrative: "Reviewed wave analysis" }),
          ],
        }),
      }),
      expect.any(AbortSignal)
    )
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: PUBLICATION_CONFIRMATION })
  );
  expect(screen.getByRole("button", { name: "Publish to GMS" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText("System narrative"), {
    target: { value: "Manual override" },
  });
  expect(screen.queryByRole("button", { name: "Publish to GMS" })).toBeNull();
  expect(screen.getByText("Changes pending")).toBeInTheDocument();
  expect(actions.previewProductPdfAction).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft saved.");
  await waitFor(() =>
    expect(actions.previewProductPdfAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedRevision: 1,
        guidance: expect.objectContaining({
          local_assessment: "Canonical saved assessment",
          systems: [expect.objectContaining({ narrative: "Manual override" })],
        }),
      }),
      expect.any(AbortSignal)
    )
  );
});

it("appends CAP wording to the chosen forecast field and refuses text over the field limit", async () => {
  picker.expose = true;
  await openEditor();
  const summary = screen.getByLabelText(WEATHER_SUMMARY_LABEL);
  fireEvent.change(summary, { target: { value: "Existing summary." } });

  fireEvent.click(screen.getByRole("button", { name: "Insert CAP wording" }));
  await waitFor(() =>
    expect(summary).toHaveValue("Existing summary.\n\nCAP wording")
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Insert oversized CAP text" })
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(FIELD_LIMIT_ERROR);
  expect(summary).toHaveValue("Existing summary.\n\nCAP wording");
});

function storedMarine(overrides: Partial<StoredProduct> = {}): StoredProduct {
  return {
    id: "7d517fe0-a25b-4f12-a2b4-eaaed8116010",
    kind: "marine",
    values: emptyProduct("marine", grenadaDate()),
    revision: 2,
    publishedRevision: 2,
    updatedAt: "2026-10-07T12:00:00Z",
    ...overrides,
  };
}

it("requires a revision note before withdrawing a published product", async () => {
  actions.loadProductsAction.mockResolvedValue({
    ok: true,
    products: [storedMarine()],
  });
  render(<ProductDesk kinds={["marine"]} title="Bulletins" />);
  fireEvent.click(await screen.findByRole("button", { name: OPEN_MARINE }));

  fireEvent.click(screen.getByRole("button", { name: "Withdraw publication" }));
  expect(
    await screen.findByText("Explain the withdrawal in the revision note.")
  ).toBeInTheDocument();
  expect(screen.queryByRole("alertdialog")).toBeNull();

  fireEvent.change(screen.getByLabelText("Issue / revision note"), {
    target: { value: "Issued in error" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Withdraw publication" }));
  expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
});

it("loads the revision history on request, lists each revision and reports a failed load", async () => {
  actions.loadProductsAction.mockResolvedValue({
    ok: true,
    products: [storedMarine({ publishedRevision: null })],
  });
  actions.loadProductHistoryAction
    .mockResolvedValueOnce({ ok: false, error: "History is unavailable." })
    .mockResolvedValueOnce({
      ok: true,
      history: [
        {
          revision: 2,
          action: "publish",
          actorName: "Ann Forecaster",
          createdAt: "2026-10-07T12:00:00Z",
          changeSummary: "Initial issue",
        },
        {
          revision: 1,
          action: "save",
          actorName: "Ann Forecaster",
          createdAt: "2026-10-07T11:00:00Z",
          changeSummary: "",
        },
      ],
    });
  render(<ProductDesk kinds={["marine"]} title="Bulletins" />);
  fireEvent.click(await screen.findByRole("button", { name: OPEN_MARINE }));
  const load = screen.getByRole("button", { name: "View revision history" });

  fireEvent.click(load);
  expect(
    await screen.findByText("History is unavailable.")
  ).toBeInTheDocument();

  await waitFor(() => expect(load).toBeEnabled());
  fireEvent.click(load);
  expect(await screen.findByText(REVISION_TWO_LINE)).toBeInTheDocument();
  expect(screen.getByText("Initial issue")).toBeInTheDocument();
  const older = screen.getByText(REVISION_ONE_LINE);
  expect(
    within(older.closest("li") as HTMLElement).queryByText("Initial issue")
  ).toBeNull();
  expect(actions.loadProductHistoryAction).toHaveBeenCalledWith(
    "7d517fe0-a25b-4f12-a2b4-eaaed8116010"
  );
});
