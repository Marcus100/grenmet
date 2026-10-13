import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { LatestReports, type ReportRow } from "./eregister-reports";

const synop: ReportRow[] = [
  { id: "a", observed: "2026-07-07 23:00", message: "AAXX latest" },
  { id: "b", observed: "2026-07-07 22:00", message: "AAXX older" },
];

function renderReports() {
  render(
    <LatestReports
      reports={{ SYNOP: synop, METAR: [], SPECI: [] }}
      sample={false}
    />
  );
}

it("shows only the latest report until history is opened", () => {
  renderReports();
  expect(screen.getByText("AAXX latest")).toBeTruthy();
  expect(screen.queryByText("AAXX older")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "View all (2)" }));
  expect(screen.getByText("AAXX older")).toBeTruthy();
});

it("says so when a report type has no records", () => {
  renderReports();
  fireEvent.click(screen.getByRole("tab", { name: "SPECI" }));
  expect(screen.getByText("No SPECI reports recorded.")).toBeTruthy();
});
