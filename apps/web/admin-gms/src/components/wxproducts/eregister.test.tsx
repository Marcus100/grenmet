import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ERegister } from "./eregister";

const STATION_NAME = /Maurice Bishop International Airport/;
const METAR_PREFIX = /TGPY 072300Z/;
const REPORT_IND_HEADER = /Report ind\./;

describe("ERegister", () => {
  it("renders the station header and observation context", () => {
    render(<ERegister />);

    expect(
      screen.getByRole("heading", { name: "eRegister — Hourly Observations" })
    ).toBeInTheDocument();
    expect(screen.getByText(STATION_NAME)).toBeInTheDocument();
    expect(screen.getByText("Fimber Frank")).toBeInTheDocument();
    expect(screen.getByText("QC passed")).toBeInTheDocument();
  });

  it("renders the coded sections, summaries and transmitted log", () => {
    render(<ERegister />);

    expect(
      screen.getByText("Section 1 — surface observation")
    ).toBeInTheDocument();
    expect(screen.getByText("Section 3 — regional groups")).toBeInTheDocument();
    expect(screen.getByText("Rainfall")).toBeInTheDocument();
    expect(screen.getByText("Maximum temperature")).toBeInTheDocument();
    expect(screen.getByText("Minimum temperature")).toBeInTheDocument();
    expect(screen.getByText("Transmitted observations")).toBeInTheDocument();
    // METAR string and at least one SYNOP log row render as code.
    expect(screen.getByText(METAR_PREFIX)).toBeInTheDocument();
    expect(screen.getAllByText("Sent").length).toBeGreaterThan(0);
  });

  it("renders register content as spreadsheet-style tables", () => {
    render(<ERegister />);

    // Current observation, daily summaries, sections 1 & 3, transmitted log.
    expect(screen.getAllByRole("table")).toHaveLength(5);
    expect(
      screen.getByRole("columnheader", { name: "Parameter" })
    ).toBeInTheDocument();
    // Section 1 strip leads with the report indicator and station cells.
    expect(
      screen.getByRole("columnheader", { name: REPORT_IND_HEADER })
    ).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "AAXX" })).toBeInTheDocument();
    // Daily summaries grid: hour rows plus the 12–12 totals row.
    expect(screen.getByRole("cell", { name: "06:00" })).toBeInTheDocument();
    expect(
      screen.getByRole("cell", { name: "Daily 12–12" })
    ).toBeInTheDocument();
  });
});
