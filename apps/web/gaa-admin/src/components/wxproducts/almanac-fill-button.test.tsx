import { type ProductField, productFields } from "@barrelsgd/gms/products";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  astronomy: vi.fn(),
  tides: vi.fn(),
  report: vi.fn(),
}));

vi.mock("@barrelsgd/api-client", () => ({
  almanacGetAstronomy: (args: unknown) => ({
    unwrap: () => mocks.astronomy(args),
  }),
  almanacGetTides: (args: unknown) => ({
    unwrap: () => mocks.tides(args),
  }),
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.report }));

import { AlmanacFillButton } from "./almanac-fill-button";

afterEach(() => {
  cleanup();
  // Clear call history only; each test sets its own implementation.
  mocks.astronomy.mockClear();
  mocks.tides.mockClear();
  mocks.report.mockClear();
});

const sunFields = productFields("morning").filter(
  (f) => f.fillFrom === "almanac"
);
const tideFields = productFields("marine-forecast").filter(
  (f) => f.fillFrom === "tides"
);

function astronomyAnswer() {
  return {
    location: { key: "mbia", name: "Grenada", latitude: 12, longitude: -61.8 },
    phases: [],
    days: [
      {
        date: "2026-11-09",
        sunrise: { utc: null, local: "2026-11-09T06:02:00-04:00" },
        sunset: { utc: null, local: "2026-11-09T17:41:00-04:00" },
        civil_dawn: { utc: null, local: null },
        civil_dusk: { utc: null, local: null },
        moonrise: { utc: null, local: null },
        moonset: { utc: null, local: null },
        moon_phase: "Waxing Crescent",
      },
      {
        date: "2026-11-10",
        sunrise: { utc: null, local: "2026-11-10T06:03:00-04:00" },
        sunset: { utc: null, local: "2026-11-10T17:41:00-04:00" },
        civil_dawn: { utc: null, local: null },
        civil_dusk: { utc: null, local: null },
        moonrise: { utc: null, local: null },
        moonset: { utc: null, local: null },
        moon_phase: "Waxing Crescent",
      },
    ],
  };
}

function renderButton(options: {
  date?: string | null;
  fields?: readonly ProductField[];
  onFill?: (apply: unknown) => string[];
  source?: "almanac" | "tides";
}) {
  const onFill = options.onFill ?? vi.fn(() => ["sunsetToday"]);
  const source = options.source ?? "almanac";
  render(
    <AlmanacFillButton
      date={options.date === undefined ? "2026-11-09" : options.date}
      fields={options.fields ?? (source === "almanac" ? sunFields : tideFields)}
      marine={source === "tides"}
      onFill={onFill}
      prefix=""
      source={source}
      values={{}}
    />
  );
  return onFill;
}

describe("Fill from almanac", () => {
  it("reads the issue date and tomorrow, then hands the values to the editor", async () => {
    mocks.astronomy.mockResolvedValue(astronomyAnswer());
    const onFill = renderButton({
      onFill: vi.fn(() => ["sunsetToday", "sunriseTomorrow"]),
    });

    fireEvent.click(screen.getByRole("button", { name: "Fill from almanac" }));

    expect(
      await screen.findByText("Filled from the almanac (predicted)")
    ).toBeTruthy();
    expect(mocks.astronomy).toHaveBeenCalledWith({
      query: { location: "mbia", from: "2026-11-09", to: "2026-11-10" },
    });
    expect(onFill).toHaveBeenCalledWith({
      patch: { sunsetToday: "17:41", sunriseTomorrow: "06:03" },
      prefix: "",
      rows: 0,
    });
  });

  it("says which day has no almanac row and fills nothing for it", async () => {
    mocks.astronomy.mockResolvedValue({ ...astronomyAnswer(), days: [] });
    renderButton({ onFill: vi.fn(() => []) });

    fireEvent.click(screen.getByRole("button", { name: "Fill from almanac" }));

    expect(
      await screen.findByText("No value was available to fill.")
    ).toBeTruthy();
    expect(
      screen.getByText(
        "No almanac row for 9 Nov 2026. Left empty: Sunset today."
      )
    ).toBeTruthy();
  });

  it("says nothing was filled when the read fails, and reports it", async () => {
    mocks.astronomy.mockRejectedValue(new Error("network"));
    renderButton({});

    fireEvent.click(screen.getByRole("button", { name: "Fill from almanac" }));

    expect(
      await screen.findByText(
        "The almanac could not be read. Nothing was filled."
      )
    ).toBeTruthy();
    expect(mocks.report).toHaveBeenCalledWith(expect.any(Error), "wxproducts");
  });

  it("cannot fill an evening day with no date yet", () => {
    renderButton({ date: null });

    const button = screen.getByRole("button", { name: "Fill from almanac" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Set the date for this day first.")).toBeTruthy();
    expect(mocks.astronomy).not.toHaveBeenCalled();
  });
});

describe("Fill from tide table", () => {
  it("keeps the predicted, not for navigation note and fills the tide slots", async () => {
    mocks.tides.mockResolvedValue({
      station: "pric",
      name: "Prickly Bay",
      events: [
        {
          event_type: "LOW",
          time_utc: "2026-11-09T07:12:00Z",
          time_local: "2026-11-09T03:12:00-04:00",
          height_m_mllw: 0.2,
          timing_quality: "predicted",
        },
      ],
    });
    const onFill = renderButton({
      source: "tides",
      onFill: vi.fn(() => ["tide1Type"]),
    });

    expect(screen.getByText("Predicted, not for navigation.")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Fill from tide table" })
    );

    expect(
      await screen.findByText(
        "Filled from the tide table (predicted, not for navigation)"
      )
    ).toBeTruthy();
    expect(screen.getByText("Low 03:12, 0.20 m (0.7 ft)")).toBeTruthy();
    expect(mocks.tides).toHaveBeenCalledWith({
      query: { station: "pric", from: "2026-11-09", to: "2026-11-09" },
    });
    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({
          tide1Type: "Low",
          tide1Time: "03:12",
        }),
        rows: 1,
      })
    );
  });

  it("says when the table has no tides for the date", async () => {
    mocks.tides.mockResolvedValue({
      station: "pric",
      name: "Prickly Bay",
      events: [],
    });
    renderButton({ source: "tides", onFill: vi.fn(() => []) });

    fireEvent.click(
      screen.getByRole("button", { name: "Fill from tide table" })
    );

    expect(
      await screen.findByText(
        "No tide predictions for 9 Nov 2026 in the table. Tide fields left empty."
      )
    ).toBeTruthy();
  });
});
