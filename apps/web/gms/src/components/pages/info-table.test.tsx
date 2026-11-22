import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { InfoTable } from "@/components/pages/info-table";

it("gives each phone card its own label and value for every cell", () => {
  render(
    <InfoTable headers={["Station", "Wind"]} rows={[["MBIA", "ESE 13 km/h"]]} />
  );
  expect(screen.getByText("Wind", { selector: "dt" })).toBeInTheDocument();
  expect(
    screen.getByText("ESE 13 km/h", { selector: "dd" })
  ).toBeInTheDocument();
});

it("wraps the table in a labelled region keyboard users can reach and scroll", () => {
  render(
    <InfoTable
      caption="Observed at 06:00 AST"
      headers={["Station", "Wind"]}
      rows={[["MBIA", "ESE 13 km/h"]]}
    />
  );
  const region = screen.getByRole("region", {
    name: "Table: Observed at 06:00 AST",
  });
  expect(region).toHaveAttribute("tabindex", "0");
  expect(region).toContainElement(screen.getByRole("table"));
});
