import { SessionUserProvider } from "@barrelsgd/auth";
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

// Form-level behaviour of the validation summary and the sticky action bar.

const PUBLICATION_CONFIRMATION = /checked the content/u;

const actions = vi.hoisted(() => ({
  loadProductsAction: vi.fn(),
  loadProductHistoryAction: vi.fn(),
  previewProductAction: vi.fn(),
  saveProductAction: vi.fn(),
  previewProductPdfAction: vi.fn(),
  downloadProductPdfAction: vi.fn(),
}));
vi.mock("@/app/(admin)/wxproducts/product-actions", () => actions);
vi.mock("@barrelsgd/gms/components/product-content", () => ({
  ProductContentView: ({
    content,
  }: {
    content: { values: Record<string, string> };
  }) => <p>{content.values.summary}</p>,
}));

const WEATHER_PROBLEM = "Weather: Weather forecast is required";

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
  actions.previewProductPdfAction.mockResolvedValue({
    ok: true,
    blob: new Blob(["%PDF"]),
  });
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

async function openEditor() {
  render(
    <ProductDesk
      description="Test desk."
      kinds={["morning"]}
      title="Forecasts"
    />
  );
  const button = await screen.findByRole("button", {
    name: "Validate and preview",
  });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

it("moves focus to the summary, links each problem to its field and shows it inline", async () => {
  actions.previewProductAction.mockResolvedValue({
    ok: true,
    preview: {
      values: {},
      errors: [WEATHER_PROBLEM, "The whole forecast needs another look"],
      checked_at: "2026-10-07T12:00:00Z",
    },
  });
  fireEvent.click(await openEditor());
  const summary = await screen.findByRole("alert", {
    name: "There is a problem",
  });
  await waitFor(() => expect(summary).toHaveFocus());
  expect(
    within(summary).getByText("The whole forecast needs another look")
  ).toBeInTheDocument();

  const field = document.getElementById("morning-summary");
  if (!field) throw new Error("the weather forecast field is not rendered");
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(field).toHaveAccessibleDescription(WEATHER_PROBLEM);

  // Move focus away, then follow the link back to the field.
  screen.getByRole("button", { name: "Save draft" }).focus();
  fireEvent.click(within(summary).getByRole("link", { name: WEATHER_PROBLEM }));
  await waitFor(() => expect(field).toHaveFocus());
});

it("keeps the action bar sticky and Publish disabled while a failed save leaves problems", async () => {
  actions.previewProductAction.mockImplementation(async ({ values }) => ({
    ok: true,
    preview: { values, errors: [], checked_at: "2026-09-17T12:00:00Z" },
  }));
  actions.saveProductAction.mockResolvedValue({
    ok: false,
    error: WEATHER_PROBLEM,
  });
  fireEvent.click(await openEditor());
  await screen.findByRole("region", { name: "Publication preview" });
  fireEvent.click(
    screen.getByRole("checkbox", { name: PUBLICATION_CONFIRMATION })
  );
  const bar = screen.getByRole("region", { name: "Product actions" });
  expect(
    within(bar).getByRole("button", { name: "Publish to GMS" })
  ).toBeEnabled();

  fireEvent.click(within(bar).getByRole("button", { name: "Save draft" }));
  await screen.findByRole("alert", { name: "There is a problem" });

  expect(bar).toHaveClass("sticky", "bottom-0");
  expect(within(bar).getByRole("button", { name: "1 problem" })).toBeVisible();
  expect(
    within(bar).getByRole("button", { name: "Publish to GMS" })
  ).toBeDisabled();
});
