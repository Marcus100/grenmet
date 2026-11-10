import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NhcMarineGuidancePanel } from "./nhc-marine-guidance";

const requestMock = vi.hoisted(() => vi.fn());
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
};

afterEach(() => {
  cleanup();
  requestMock.mockReset();
});

it("fills empty NHC fields once, records the NHC edition, and says where the values came from", async () => {
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
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
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
  expect(screen.getByText(NHC_SAYS)).toBeTruthy();
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
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  const [, proposed] = onChange.mock.calls[0] ?? [];
  expect(proposed.windSpeedMin).toBe("12");
  expect(proposed.windSpeedMax).toBe("20");
});

it("says when no Offshore Waters Forecast is imported and leaves fields empty", async () => {
  requestMock.mockResolvedValue({
    status: "not_imported",
    zone_id: "AMZ058",
    zone_name: null,
    product: null,
    periods: [],
    outlook: null,
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

it("does not fill while the form is read-only", async () => {
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
  expect(await screen.findByText(NHC_SAYS)).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
});
