import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { reportError } from "@/lib/report-error";
import { NhcMarineGuidancePanel } from "./nhc-marine-guidance";

const requestMock = vi.hoisted(() => vi.fn());
const FILL = /Fill empty fields from NHC/u;
const STALE = /older than 12 hours/u;
const UNAVAILABLE = /NHC marine guidance is unavailable/u;
const LOCAL_ASSESSMENT = /needs your GMS local assessment/u;
const FROM_NHC = /From NHC AMZ058/u;
const NHC_SAYS = /NHC says/u;
const NOT_IMPORTED = /No NHC Offshore Waters Forecast has been imported/u;
const NO_BLOCK = /has no AMZ058 block/u;

vi.mock("@/lib/wxproducts/nhc-api", () => ({ nhcRequest: requestMock }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const product = {
  edition_id: "7f1c3a52-0a52-4c7e-9a52-000000000001",
  product_key: "nhc:offnt3",
  title: "OFFNT3",
  issued_at: "2026-11-09T19:52:00Z",
  sha256: "a".repeat(64),
  url: null,
};
const period = (
  label: string,
  wind: { from: string | null; min: number | null; max: number | null },
  seaFt: [number, number] | null
) => ({
  label,
  text: "",
  wind_direction_from: wind.from,
  wind_direction_to: null,
  wind_min_kt: wind.min,
  wind_max_kt: wind.max,
  gust_kt: null,
  sea_min_ft: seaFt?.[0] ?? null,
  sea_max_ft: seaFt?.[1] ?? null,
  weather: [],
});
const available = {
  status: "available",
  zone_id: "AMZ058",
  zone_name: "Offshore Waters Windward Islands including Trinidad and Tobago",
  product,
  periods: [
    period("TONIGHT", { from: "E", min: 15, max: 20 }, [3, 5]),
    period("TUE", { from: "E", min: 10, max: 15 }, [2, 4]),
  ],
  outlook: null,
  stale: false,
};

afterEach(() => {
  cleanup();
  requestMock.mockReset();
  vi.mocked(reportError).mockReset();
});

async function fillButton(): Promise<HTMLButtonElement> {
  const button = await screen.findByRole("button", { name: FILL });
  if (!(button instanceof HTMLButtonElement)) throw new Error("Not a button");
  return button;
}

it("fills empty NHC fields only when asked, records the NHC edition, and says where the values came from", async () => {
  requestMock.mockResolvedValue(available);
  const onChange = vi.fn();
  render(
    <NhcMarineGuidancePanel
      disabled={false}
      guidance={null}
      kind="marine-forecast"
      onChange={onChange}
      values={{ windDirFrom: "", windSpeedMin: "", synopsis: "Typed" }}
    />
  );
  const button = await fillButton();
  expect(screen.getByText(NHC_SAYS)).toBeTruthy();
  // Opening the form never fills: a field the forecaster cleared stays cleared.
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(onChange).toHaveBeenCalledTimes(1);
  const [next, proposed] = onChange.mock.calls[0] ?? [];
  expect(proposed).toMatchObject({
    windDirFrom: "E",
    windSpeedMin: "15",
    windSpeedMax: "20",
    waveHeightMin: "0.91",
    waveHeightMax: "1.52",
    synopsis: "Typed",
  });
  expect(next.sources).toEqual([product]);
  expect(screen.getByText(FROM_NHC)).toBeTruthy();
});

it("keeps a value the forecaster typed when NHC has a different one", async () => {
  requestMock.mockResolvedValue(available);
  const onChange = vi.fn();
  render(
    <NhcMarineGuidancePanel
      disabled={false}
      guidance={null}
      kind="marine-forecast"
      onChange={onChange}
      values={{ windSpeedMin: "12" }}
    />
  );
  fireEvent.click(await fillButton());
  const [, proposed] = onChange.mock.calls[0] ?? [];
  expect(proposed.windSpeedMin).toBe("12");
  expect(proposed.windSpeedMax).toBe("20");
});

it("fills a marine bulletin and says it needs a GMS local assessment", async () => {
  requestMock.mockResolvedValue(available);
  const onChange = vi.fn();
  render(
    <NhcMarineGuidancePanel
      disabled={false}
      guidance={null}
      kind="marine"
      onChange={onChange}
      values={{}}
    />
  );
  const button = await fillButton();
  expect(screen.getByText(LOCAL_ASSESSMENT)).toBeTruthy();
  fireEvent.click(button);
  const [next, proposed] = onChange.mock.calls[0] ?? [];
  expect(proposed).toMatchObject({ windDirFrom: "E", waveHeightMax: "1.52" });
  expect(next.sources).toEqual([product]);
});

it("disables the fill when every NHC field already has a value", async () => {
  requestMock.mockResolvedValue(available);
  render(
    <NhcMarineGuidancePanel
      disabled={false}
      guidance={null}
      kind="marine-forecast"
      onChange={vi.fn()}
      values={{
        windDirFrom: "NE",
        windSpeedMin: "10",
        windSpeedMax: "15",
        waveHeightMin: "1",
        waveHeightMax: "2",
      }}
    />
  );
  expect((await fillButton()).disabled).toBe(true);
});

it("shows stale guidance with a note and offers no fill", async () => {
  requestMock.mockResolvedValue({ ...available, stale: true });
  const onChange = vi.fn();
  render(
    <NhcMarineGuidancePanel
      disabled={false}
      guidance={null}
      kind="marine-forecast"
      onChange={onChange}
      values={{}}
    />
  );
  expect(await screen.findByText(STALE)).toBeTruthy();
  expect(screen.queryByRole("button", { name: FILL })).toBeNull();
  expect(screen.getByText(NHC_SAYS)).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
});

it("reports a failed load and tells the forecaster to enter values by hand", async () => {
  const failure = new Error("network");
  requestMock.mockRejectedValue(failure);
  const onChange = vi.fn();
  render(
    <NhcMarineGuidancePanel
      disabled={false}
      guidance={null}
      kind="marine-forecast"
      onChange={onChange}
      values={{}}
    />
  );
  expect(await screen.findByText(UNAVAILABLE)).toBeTruthy();
  expect(reportError).toHaveBeenCalledWith(failure, "wxproducts-nhc");
  expect(onChange).not.toHaveBeenCalled();
});
it("says when no Offshore Waters Forecast is imported and leaves fields empty", async () => {
  requestMock.mockResolvedValue({
    status: "not_imported",
    zone_id: "AMZ058",
    zone_name: null,
    product: null,
    periods: [],
    outlook: null,
    stale: false,
  });
  const onChange = vi.fn();
  render(
    <NhcMarineGuidancePanel
      disabled={false}
      guidance={null}
      kind="marine-forecast"
      onChange={onChange}
      values={{}}
    />
  );
  expect(await screen.findByText(NOT_IMPORTED)).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
});

it("says when the latest bulletin has no AMZ058 block", async () => {
  requestMock.mockResolvedValue({
    status: "zone_missing",
    zone_id: "AMZ058",
    zone_name: null,
    product,
    periods: [],
    outlook: null,
    stale: false,
  });
  const onChange = vi.fn();
  render(
    <NhcMarineGuidancePanel
      disabled={false}
      guidance={null}
      kind="marine-forecast"
      onChange={onChange}
      values={{}}
    />
  );
  expect(await screen.findByText(NO_BLOCK)).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
});

it("disables the fill while the form is read-only or saving", async () => {
  requestMock.mockResolvedValue(available);
  const onChange = vi.fn();
  render(
    <NhcMarineGuidancePanel
      disabled
      guidance={null}
      kind="marine-forecast"
      onChange={onChange}
      values={{}}
    />
  );
  const button = await fillButton();
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(onChange).not.toHaveBeenCalled();
});
