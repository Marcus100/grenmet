import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { expect, it, vi } from "vitest";
import type { StationSettings } from "./eregister-derived";
import { ERegisterWorkbook } from "./eregister-workbook";

function renderWorkbook(
  issues: { field: string; message: string; severity?: "error" | "warning" }[],
  extra: {
    onSaveStationSettings?: ComponentProps<
      typeof ERegisterWorkbook
    >["onSaveStationSettings"];
    onValueChange?: (key: string, value: string) => void;
    stationSettings?: StationSettings | null;
    values?: Record<string, string>;
  } = {}
) {
  render(
    <ERegisterWorkbook
      issues={issues}
      metarPreview="TGPY"
      observedAt="2026-07-07T23:00"
      onBack={vi.fn()}
      onSaveStationSettings={extra.onSaveStationSettings}
      onSubmit={vi.fn()}
      onValidate={vi.fn()}
      onValidationIssuesChange={vi.fn()}
      onValidationStateChange={vi.fn()}
      onValueChange={extra.onValueChange ?? vi.fn()}
      saveStatus="idle"
      send={{
        cancel: vi.fn(),
        confirm: vi.fn(),
        confirming: null,
        error: null,
        history: [],
        pending: null,
        repeat: false,
        request: vi.fn(),
      }}
      station={{
        icao: "TGPY",
        name: "Maurice Bishop International Airport",
        number: "78958",
        observer: "Observer",
        position: "12.0°N · 61.47°W",
      }}
      stationSettings={extra.stationSettings}
      validationStatus="invalid"
      values={extra.values ?? { report_type: "AAXX" }}
    />
  );
}

it("separates blocking errors from advisory warnings by field label", () => {
  renderWorkbook([
    { field: "wind_dir", message: "Wind direction must be 2 digits." },
    {
      field: "station_pressure",
      message: "Station pressure is reported with MSLP.",
      severity: "warning",
    },
  ]);
  expect(screen.getByRole("alert").textContent).toContain("Wind Direction");
  expect(screen.getByRole("alert").textContent).not.toContain("MSLP");
  expect(screen.getByRole("status").textContent).toContain("Station Pressure");
});

it("shows no issue panels when the workbook is clean", () => {
  renderWorkbook([]);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
});

const input = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

it("types visibility in kilometres and shows the calculated VV, read only", () => {
  const onValueChange = vi.fn();
  renderWorkbook([], {
    onValueChange,
    values: { report_type: "AAXX", visibility_km: "18" },
  });
  const km = input("Visibility (km) (km)");
  expect(km.value).toBe("18");
  expect(km.readOnly).toBe(false);
  fireEvent.change(km, { target: { value: "12.5" } });
  expect(onValueChange).toHaveBeenCalledWith("visibility_km", "12.5");
  const code = input("Visibility ((VV) VV), calculated");
  expect(code.value).toBe("68");
  expect(code.readOnly).toBe(true);
});

it("calculates dew point and relative humidity from the wet bulb", () => {
  renderWorkbook([], {
    values: {
      report_type: "AAXX",
      air_temp: "0280",
      station_pressure: "0153",
      wet_bulb: "0240",
    },
  });
  const dewPoint = input("Dew Point ((T'dT'd) TdTdTd), calculated");
  expect(dewPoint.value).toBe("224");
  expect(dewPoint.readOnly).toBe(true);
  expect(input("Ind. & Sign (2Sn), calculated").value).toBe("20");
  expect(input("R.H. ((e) UUU), calculated").value).toBe("72");
  // The wet bulb itself is keyed.
  expect(input("Wet Bulb (T'dT'd)").readOnly).toBe(false);
});

it("takes the time marks of the four instrument charts", () => {
  const onValueChange = vi.fn();
  renderWorkbook([], { onValueChange });
  for (const name of [
    "Anemograph",
    "Barograph",
    "Rain recorder",
    "Thermo-hygrograph",
  ]) {
    expect(screen.getByText(name)).toBeTruthy();
  }
  fireEvent.change(input("Time mark: Barograph"), {
    target: { value: "1200" },
  });
  expect(onValueChange).toHaveBeenCalledWith("time_mark_barograph", "1200");
});

it("keys the barometer as read and the 909 group", () => {
  const onValueChange = vi.fn();
  renderWorkbook([], { onValueChange });
  fireEvent.change(input("Barometer as Read (Bar.)"), {
    target: { value: "1013.2" },
  });
  expect(onValueChange).toHaveBeenCalledWith("barometer_reading", "1013.2");
  fireEvent.change(input("909 Group (909)"), { target: { value: "90912" } });
  expect(onValueChange).toHaveBeenCalledWith("s3_group_909", "90912");
});

it("shows QFE and QNH as dashes with a pending note until the settings exist", () => {
  renderWorkbook([], {
    stationSettings: { barometerCorrectionHpa: null, elevationM: null },
    values: { air_temp: "0280", barometer_reading: "1013.2" },
  });
  expect(screen.getByTestId("pending-settings-note").textContent).toContain(
    "Pending: the station elevation and the total barometer corrections"
  );
  expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
});

it("calculates QFE and QNH once the settings are entered", () => {
  renderWorkbook([], {
    stationSettings: { barometerCorrectionHpa: 0.3, elevationM: 5 },
    values: { air_temp: "0280", barometer_reading: "1015.0" },
  });
  expect(screen.queryByTestId("pending-settings-note")).toBeNull();
  expect(screen.getByText("1015.3")).toBeTruthy();
  expect(screen.getByText("1015.9")).toBeTruthy();
  expect(screen.getByText("+0.3")).toBeTruthy();
});

it("saves the station settings, leaving a blank box empty", async () => {
  const onSave = vi.fn().mockResolvedValue("saved");
  renderWorkbook([], {
    onSaveStationSettings: onSave,
    stationSettings: { barometerCorrectionHpa: null, elevationM: null },
  });
  fireEvent.change(screen.getByLabelText("Station elevation (metres)"), {
    target: { value: "5.5" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith({
      barometerCorrectionHpa: null,
      elevationM: 5.5,
    })
  );
  await waitFor(() =>
    expect(screen.getByText("Station settings saved.")).toBeTruthy()
  );
});

it("refuses a station setting that is not a number and says who may change it", async () => {
  const onSave = vi.fn().mockResolvedValue("forbidden");
  renderWorkbook([], { onSaveStationSettings: onSave, stationSettings: null });
  fireEvent.change(screen.getByLabelText("Station elevation (metres)"), {
    target: { value: "high" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "numbers only"
  );
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Station elevation (metres)"), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "quality control staff"
  );
});
