import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { expect, it, vi } from "vitest";
import type { StationSettings } from "./eregister-derived";
import { ERegisterWorkbook } from "./eregister-workbook";

const EXPECTED_TEXT = /NSC 28\/21 Q1013=/;
const WARNING_TEXT = /Q1014 differs/;

function renderWorkbook(
  issues: { field: string; message: string; severity?: "error" | "warning" }[],
  extra: {
    onSaveStationSettings?: ComponentProps<
      typeof ERegisterWorkbook
    >["onSaveStationSettings"];
    onValueChange?: (key: string, value: string) => void;
    expectedMetar?: string | null;
    stationSettings?: StationSettings | null;
    values?: Record<string, string>;
  } = {}
) {
  render(
    <ERegisterWorkbook
      expectedMetar={extra.expectedMetar}
      issues={issues.map((issue) => ({ code: "test", ...issue }))}
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

it("keys the barometer as read and the precipitation timing group", () => {
  const onValueChange = vi.fn();
  renderWorkbook([], { onValueChange });
  fireEvent.change(input("Barometer as Read (Bar.)"), {
    target: { value: "1013.2" },
  });
  expect(onValueChange).toHaveBeenCalledWith("barometer_reading", "1013.2");
  fireEvent.change(input("Precipitation Timing & Duration (909Rtdc)"), {
    target: { value: "90912" },
  });
  expect(onValueChange).toHaveBeenCalledWith("s3_group_909", "90912");
});

const STATION_78958 = {
  qfeOffsetHpa: 0.3,
  qnhOffsetHpa: 0.1,
  seaLevelOffsetHpa: 1,
  totalCorrectionHpa: 0,
};

it("works the pressures out of the barometer for 78958, with no pending note", () => {
  renderWorkbook([], {
    stationSettings: STATION_78958,
    values: { air_temp: "0280", barometer_reading: "1012.8" },
  });
  expect(screen.queryByTestId("pending-settings-note")).toBeNull();
  // Groups 3 and 4 show the rule's figure until the observer keys one.
  expect(input("Station Pressure (P0P0P0P0)").placeholder).toBe("0128");
  expect(input("MSL Pressure (PPPP)").placeholder).toBe("0138");
  expect(screen.getByText("1013.1")).toBeTruthy(); // QFE
  expect(screen.getByText("1013.9")).toBeTruthy(); // QNH
  expect(screen.getByText("0.0")).toBeTruthy(); // total correction
});

it("shows dashes and names the missing amounts for a station without them", () => {
  renderWorkbook([], {
    stationSettings: { ...STATION_78958, qnhOffsetHpa: null },
    values: { air_temp: "0280", barometer_reading: "1012.8" },
  });
  expect(screen.getByTestId("pending-settings-note").textContent).toContain(
    "Pending: the QNH amount"
  );
  expect(screen.getByText("1013.1")).toBeTruthy();
  expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
});

it("saves the four station amounts, leaving a blank box empty", async () => {
  const onSave = vi.fn().mockResolvedValue("saved");
  renderWorkbook([], {
    onSaveStationSettings: onSave,
    stationSettings: STATION_78958,
  });
  expect(input("QFE amount (hPa)").value).toBe("0.3");
  fireEvent.change(input("QFE amount (hPa)"), { target: { value: "0.4" } });
  fireEvent.change(input("QNH amount (hPa)"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith({
      qfeOffsetHpa: 0.4,
      qnhOffsetHpa: null,
      seaLevelOffsetHpa: 1,
      totalCorrectionHpa: 0,
    })
  );
  await waitFor(() =>
    expect(screen.getByText("Station settings saved.")).toBeTruthy()
  );
});

it("refuses an amount that is not a number and says who may change them", async () => {
  const onSave = vi.fn().mockResolvedValue("forbidden");
  renderWorkbook([], { onSaveStationSettings: onSave, stationSettings: null });
  fireEvent.change(input("QFE amount (hPa)"), { target: { value: "high" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "numbers only"
  );
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.change(input("QFE amount (hPa)"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "quality control staff"
  );
});

it("shows the checked METAR, keeps the typed one and lists its warnings", () => {
  const onValueChange = vi.fn();
  renderWorkbook(
    [
      {
        field: "metar_text",
        message: "METAR QNH Q1014 differs from the observation (Q1013).",
        severity: "warning",
      },
    ],
    {
      expectedMetar: "METAR TGPY 301200Z 07015KT 9999 NSC 28/21 Q1013=",
      onValueChange,
      values: { metar_text: "07015KT Q1014" },
    }
  );
  expect(screen.getByText(EXPECTED_TEXT)).toBeTruthy();
  expect(screen.getAllByText(WARNING_TEXT).length).toBeGreaterThan(0);
  const box = screen.getByLabelText(
    "METAR or SPECI as sent"
  ) as HTMLInputElement;
  expect(box.value).toBe("07015KT Q1014");
  fireEvent.change(box, { target: { value: "x" } });
  expect(onValueChange).toHaveBeenCalledWith("metar_text", "x");
});

it("limits the typed METAR to 400 characters", () => {
  renderWorkbook([]);
  const box = screen.getByLabelText(
    "METAR or SPECI as sent"
  ) as HTMLInputElement;
  expect(box.maxLength).toBe(400);
});

it("tells the observer whether the METAR was copied", async () => {
  const writeText = vi.fn().mockResolvedValueOnce(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  renderWorkbook([], { expectedMetar: "METAR TGPY 301200Z" });
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  expect(
    (await screen.findByRole("button", { name: "Copied" })).textContent
  ).toBe("Copied");
  expect(writeText).toHaveBeenCalledWith("METAR TGPY 301200Z");
  expect(screen.getByTestId("copy-status").textContent).toBe("Copied");

  writeText.mockRejectedValueOnce(new Error("denied"));
  fireEvent.click(screen.getByRole("button", { name: "Copied" }));
  expect(
    await screen.findByRole("button", { name: "Copy failed" })
  ).toBeTruthy();
});
