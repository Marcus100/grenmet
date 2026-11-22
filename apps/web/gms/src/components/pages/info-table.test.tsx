import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InfoTable } from "@/components/pages/info-table";

const CAPTION = "Observed at 06:00 AST";

describe("InfoTable phone cards", () => {
  it("gives each card its own label and value for every cell", () => {
    render(
      <InfoTable
        headers={["Station", "Wind"]}
        rows={[["MBIA", "ESE 13 km/h"]]}
      />
    );
    expect(screen.getByText("Wind", { selector: "dt" })).toBeInTheDocument();
    expect(
      screen.getByText("ESE 13 km/h", { selector: "dd" })
    ).toBeInTheDocument();
  });

  it("labels a column with no header rather than leaving its card label empty", () => {
    render(<InfoTable headers={["Station", ""]} rows={[["MBIA", "Clear"]]} />);
    expect(screen.getByText("Value", { selector: "dt" })).toBeInTheDocument();
  });

  it("keeps a column apart when two headers have the same text", () => {
    render(<InfoTable headers={["Temp", "Temp"]} rows={[["27°C", "29°C"]]} />);
    expect(screen.getAllByText("Temp", { selector: "dt" })).toHaveLength(2);
    expect(screen.getByText("29°C", { selector: "dd" })).toBeInTheDocument();
  });
});

describe("InfoTable desktop table", () => {
  it("labels the region and keeps keyboard focus on the scrolling table, not on the phone list", () => {
    render(
      <InfoTable
        caption={CAPTION}
        headers={["Station", "Wind"]}
        rows={[["MBIA", "ESE 13 km/h"]]}
      />
    );
    const region = screen.getByRole("region", {
      name: `Table: ${CAPTION}`,
    });
    const table = within(region).getByRole("table");
    const scroller = table.parentElement;
    expect(scroller).toHaveAttribute("tabindex", "0");
    expect(region).not.toHaveAttribute("tabindex");
    const phoneList = within(region).getByRole("list");
    expect(phoneList).not.toHaveAttribute("tabindex");
  });
});
