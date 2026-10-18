import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ERegisterWorkbook } from "./eregister-workbook";

function renderWorkbook(
  issues: { field: string; message: string; severity?: "error" | "warning" }[]
) {
  render(
    <ERegisterWorkbook
      issues={issues}
      metarPreview="TGPY"
      observedAt="2026-07-07T23:00"
      onBack={vi.fn()}
      onSubmit={vi.fn()}
      onValidate={vi.fn()}
      onValidationIssuesChange={vi.fn()}
      onValidationStateChange={vi.fn()}
      onValueChange={vi.fn()}
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
      validationStatus="invalid"
      values={{ report_type: "AAXX" }}
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
