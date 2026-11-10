import { SessionUserProvider } from "@barrelsgd/auth";
import type { StoredProduct } from "@barrelsgd/gms/products";
import {
  render as baseRender,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { GmsCatalogueProvider } from "@/components/cap/gms-catalogue";
import { gmsCatalogueFixture } from "@/test/cap-gms-catalogue.fixture";
import { ProductDesk } from "./product-desk";

const actions = vi.hoisted(() => ({
  loadProductsAction: vi.fn(),
  loadProductHistoryAction: vi.fn(),
  previewProductAction: vi.fn(),
  saveProductAction: vi.fn(),
  previewProductPdfAction: vi.fn(),
  downloadProductPdfAction: vi.fn(),
}));
vi.mock("@/app/(admin)/wxproducts/product-actions", () => actions);
vi.mock("./cap-forecast-picker", () => ({ CapForecastPicker: () => null }));

const WORDING = /^Weather wording$/u;
const WAVES_FROM_M = /^Waves from \(m\)/u;
const WAVES_TO_M = /^Waves to \(m\)/u;
const KNOTS = /Speed from \(kt\)/u;
const COLOUR_LEVEL = /Colour level/u;
const VALIDITY_TEXT = /Validity description/u;
const ARCHIVE_REFERENCE = /Archive reference/u;
const ALL_CLEAR_HELP = /All clear: the hazard has ended/u;

function render(ui: ReactElement) {
  return baseRender(
    <GmsCatalogueProvider catalogue={gmsCatalogueFixture}>
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
    </GmsCatalogueProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  actions.loadProductsAction.mockResolvedValue({ ok: true, products: [] });
});
async function open(kinds: Parameters<typeof ProductDesk>[0]["kinds"]) {
  render(<ProductDesk description="Test desk." kinds={kinds} title="Desk" />);
  const button = await screen.findByRole("button", {
    name: "Validate and preview",
  });
  await waitFor(() => expect(button).toBeEnabled());
}

it("picks several weather types with coverage and writes an editable sentence", async () => {
  await open(["morning"]);
  const weather = screen.getByRole("group", { name: "Weather type" });
  fireEvent.click(
    within(weather).getByRole("checkbox", { name: "Light showers" })
  );
  fireEvent.change(within(weather).getByLabelText("Light showers: coverage"), {
    target: { value: "scattered" },
  });
  fireEvent.click(
    within(weather).getByRole("checkbox", { name: "Saharan dust haze" })
  );
  const wording = screen.getByLabelText(WORDING);
  expect(wording).toHaveValue("Saharan dust haze and scattered light showers.");
  // A reworded sentence is left alone when the selection changes.
  fireEvent.change(wording, { target: { value: "Hazy, a few showers." } });
  fireEvent.click(within(weather).getByRole("checkbox", { name: "Haze" }));
  expect(wording).toHaveValue("Hazy, a few showers.");
  // Haze takes no coverage word.
  expect(within(weather).queryByLabelText("Haze: coverage")).toBeNull();
});

it("shows the marine forecast in knots with the wave range on one line", async () => {
  await open(["morning", "marine-forecast"]);
  fireEvent.click(screen.getByRole("tab", { name: "Marine forecast" }));
  expect(await screen.findByLabelText(KNOTS)).toBeInTheDocument();
  const from = screen.getByLabelText(WAVES_FROM_M);
  const to = screen.getByLabelText(WAVES_TO_M);
  expect(from.closest("fieldset")).toBe(to.closest("fieldset"));
  fireEvent.change(from, { target: { value: "1.5" } });
  fireEvent.change(to, { target: { value: "2.5" } });
  // Entered in metres, as stored; feet as the hint.
  expect(from).toHaveValue(1.5);
  expect(screen.getByText("Waves ≈ 5–8 ft")).toBeInTheDocument();
  const astronomy = screen.getByRole("region", { name: "Astronomy fields" });
  expect(within(astronomy).getByLabelText("Moonrise")).toHaveAttribute(
    "type",
    "time"
  );
  expect(
    within(astronomy).getByLabelText("Next principal phase date")
  ).toHaveAttribute("type", "date");
});

it("hides an alert's level and validity text and proposes the next number", async () => {
  const today = new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10);
  const previous: StoredProduct = {
    id: "previous",
    kind: "marine",
    revision: 1,
    publishedRevision: 1,
    updatedAt: "2026-11-09T00:00:00Z",
    values: {
      issuedAt: `${today}T01:00`,
      validTo: `${today}T23:00`,
      bulletinNumber: "2",
      notice: "Advisory",
    },
  };
  actions.loadProductsAction.mockResolvedValue({
    ok: true,
    products: [previous],
  });
  await open(["marine"]);
  await waitFor(() =>
    expect(screen.getByLabelText("Bulletin number")).toHaveValue("3")
  );
  expect(screen.queryByLabelText(COLOUR_LEVEL)).toBeNull();
  expect(screen.queryByLabelText(VALIDITY_TEXT)).toBeNull();
  expect(screen.queryByLabelText(ARCHIVE_REFERENCE)).toBeNull();
  expect(screen.getByLabelText("Bulletin purpose *")).toBeInTheDocument();
  expect(screen.getByText(ALL_CLEAR_HELP)).toBeInTheDocument();
});
