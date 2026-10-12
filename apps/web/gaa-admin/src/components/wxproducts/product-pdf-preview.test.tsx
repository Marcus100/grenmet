import type { ProductContent } from "@barrelsgd/gms/products";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ProductPdfPreview } from "./product-pdf-preview";

const SAVE_TO_DOWNLOAD_HINT = /Save draft to download these changes\./;

const download = vi.hoisted(() => vi.fn());
const previewControls = {
  request: null,
  expanded: false,
  onExpandedChange: vi.fn(),
  onPreview: vi.fn(),
};
vi.mock("@/app/(admin)/wxproducts/product-actions", () => ({
  downloadProductPdfAction: download,
  previewProductPdfAction: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock("@/components/document/document-preview", () => ({
  DocumentPreview: ({
    actions,
    children,
    description,
  }: {
    actions?: ReactNode;
    children: ReactNode;
    description?: ReactNode;
  }) => (
    <div>
      {actions}
      {description}
      {children}
    </div>
  ),
}));
vi.mock("@/components/document/paper", () => ({
  Paper: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
beforeEach(() => {
  vi.resetAllMocks();
  download.mockResolvedValue({ ok: false, error: "Download unavailable" });
});
const saved = {
  id: "fc5297f6-6870-4982-a41b-31f5c34cb9f2",
  revision: 3,
  publishedRevision: 2,
};
it("requires saving edits but allows the separate published copy", async () => {
  render(
    <ProductPdfPreview
      {...previewControls}
      content={{ kind: "morning", values: {} }}
      dirty
      saved={saved}
    />
  );
  expect(
    screen.getByRole("button", { name: "Download saved revision PDF" })
  ).toBeDisabled();
  expect(screen.getByText(SAVE_TO_DOWNLOAD_HINT)).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Published r2: download PDF" })
  );
  await waitFor(() => expect(download).toHaveBeenCalledWith(saved.id, 2));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Download unavailable"
  );
});
it("downloads the current saved revision", async () => {
  render(
    <ProductPdfPreview
      {...previewControls}
      content={{ kind: "morning", values: {} }}
      saved={saved}
    />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Download saved revision PDF" })
  );
  await waitFor(() => expect(download).toHaveBeenCalledWith(saved.id, 3));
});
it("does not offer an unsaved document as a saved PDF", () => {
  render(
    <ProductPdfPreview
      {...previewControls}
      content={{ kind: "morning", values: {} }}
    />
  );
  expect(
    screen.getByRole("button", { name: "Download saved revision PDF" })
  ).toBeDisabled();
});

it.each([
  ["morning", "summary", "Forecast narrative"],
  ["evening", "summary", "Tonight's narrative"],
  ["marine", "synopsis", "Marine narrative"],
  ["outlook", "systems", "Outlook narrative"],
] as const)(
  "shows the live text summary for %s",
  (kind, narrativeKey, narrative) => {
    const content: ProductContent = {
      kind,
      values: {
        issuedAt: "2026-10-12T07:00",
        validFrom: "2026-10-12T07:00",
        validTo: "2026-10-13T07:00",
        forecaster: "Duty Forecaster",
        [narrativeKey]: narrative,
        wind: "Full wind details",
        advisories: "Full advisory details",
      },
    };
    const view = render(
      <ProductPdfPreview {...previewControls} content={content} />
    );
    expect(screen.getByText(narrative)).toHaveClass("whitespace-pre-wrap");
    expect(screen.getByText("Duty Forecaster")).toBeInTheDocument();
    expect(
      screen.getByText("Live summary · Grenada time (UTC−04:00)")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Issued (Grenada time)").nextElementSibling
    ).toHaveTextContent("2026-10-12 07:00");
    if (kind !== "outlook")
      expect(screen.getByText("Full wind details")).toBeInTheDocument();
    expect(screen.queryByText("Full advisory details")).toBeNull();
    expect(screen.queryByTitle("Forecast PDF preview")).toBeNull();
    const longNarrative = "Long narrative\n".repeat(40);
    view.rerender(
      <ProductPdfPreview
        {...previewControls}
        content={{
          kind,
          values: { ...content.values, [narrativeKey]: longNarrative },
        }}
      />
    );
    expect(
      screen.getByText(longNarrative.replaceAll("\n", " ").trim())
    ).toHaveClass("whitespace-pre-wrap", "break-words");
  }
);

it("shows missing values and keeps the full PDF collapsed initially", () => {
  render(
    <ProductPdfPreview
      {...previewControls}
      content={{ kind: "morning", values: {} }}
    />
  );
  expect(screen.getAllByText("Not entered")).toHaveLength(5);
  expect(screen.getByRole("button", { name: "Show full PDF" })).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview PDF" }));
  expect(previewControls.onPreview).toHaveBeenCalledOnce();
});

it("groups entered weather, wind, marine, tides and astronomy without empty fields or stale composed text", () => {
  render(
    <ProductPdfPreview
      {...previewControls}
      content={{
        kind: "morning",
        values: {
          summary: "Sunny spells",
          condition: "Sunny",
          rainChance: "0",
          minTemperature: "24",
          maxTemperature: "31",
          windDirFrom: "NE",
          windSpeedMin: "10",
          windSpeedMax: "15",
          wind: "Old wind summary",
          seaStateFrom: "Moderate",
          waveHeightMin: "1.5",
          seaState: "Old marine summary",
          tide1Type: "High",
          tide1Time: "15:30",
          tide1Height: "0.4",
          sunrise: "06:00",
          word: "Convection",
          definition: "Rising warm air",
        },
      }}
    />
  );
  expect(
    within(screen.getByRole("region", { name: "Weather summary" })).getByText(
      "0"
    )
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("region", { name: "Wind summary" })).getByText("NE")
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("region", { name: "Marine summary" })).getByText(
      "1.5"
    )
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("region", { name: "Tides summary" })).getByText(
      "15:30"
    )
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("region", { name: "Astronomy summary" })).getByText(
      "06:00"
    )
  ).toBeInTheDocument();
  expect(
    within(
      screen.getByRole("region", { name: "Word of the day summary" })
    ).getByText("Rising warm air")
  ).toBeInTheDocument();
  expect(screen.queryByText("Old wind summary")).toBeNull();
  expect(screen.queryByText("Old marine summary")).toBeNull();
  expect(screen.queryByText("Gusts (kt)")).toBeNull();
});

it.each([
  [
    "evening",
    { day1Weather: "Day one weather", day1WindSpeedMin: "12" },
    "Day 1 · Wind summary",
    "12",
  ],
  [
    "marine",
    { visibilityMin: "4", impacts: "Rough seas", response: "Exercise caution" },
    "Visibility summary",
    "4",
  ],
  [
    "outlook",
    {
      formation: "Formation unlikely",
      formationChance48h: "0",
      nextUpdate: "2026-10-12T14:00",
    },
    "Outlook summary",
    "2026-10-12 14:00",
  ],
] as const)(
  "shows additional entered sections for %s",
  (kind, values, section, value) => {
    render(
      <ProductPdfPreview {...previewControls} content={{ kind, values }} />
    );
    expect(
      within(screen.getByRole("region", { name: section })).getByText(value)
    ).toBeInTheDocument();
  }
);

it("keeps formation probabilities beside their systems without distributing legacy values", () => {
  render(
    <ProductPdfPreview
      {...previewControls}
      content={{
        kind: "outlook",
        values: { formationChance48h: "90", formationChance7d: "100" },
        guidance: {
          systems: [
            {
              id: "system-a",
              name: "Eastern wave",
              feature_type: "tropical_wave",
              narrative: "Wave analysis",
              facts: [
                {
                  key: "formation_probability",
                  record_type: "forecast",
                  horizon_hours: 48,
                  qualifier: "near zero",
                  description: "near zero",
                  value: null,
                },
              ],
            },
            {
              id: "system-b",
              name: "Western low",
              feature_type: "low_pressure_area",
              narrative: "Low analysis",
              facts: [
                {
                  key: "formation_probability",
                  record_type: "forecast",
                  horizon_hours: 168,
                  value: 70,
                },
              ],
            },
          ],
        },
      }}
    />
  );
  expect(
    within(
      screen.getByRole("region", { name: "Eastern wave summary" })
    ).getByText("near zero")
  ).toBeInTheDocument();
  expect(
    within(
      screen.getByRole("region", { name: "Western low summary" })
    ).getByText("70%")
  ).toBeInTheDocument();
  expect(screen.queryByText("90")).toBeNull();
  expect(screen.queryByText("100")).toBeNull();
});
