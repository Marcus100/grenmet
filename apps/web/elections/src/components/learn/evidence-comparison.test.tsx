import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  EvidenceComparison,
  type EvidenceComparisonRow,
} from "@/components/learn/evidence-comparison";

const YEAR = /1990/;
const base = {
  label: "Mixed sources",
  formula: "Complete denominator",
  source: "Archive",
  note: "Missing original report",
  official: false,
};
const rows: EvidenceComparisonRow[] = [
  {
    id: "1990",
    href: "/elections/1990",
    year: 1990,
    votes: 40_000,
    seats: 15,
    turnout: 0.7,
    evidence: {
      votes: base,
      seats: { ...base, official: true, label: "Official declarations" },
      turnout: base,
    },
  },
];
describe("evidence comparison", () => {
  it("withholds a mixed-source statistic without changing its denominator or losing officially declared seats", () => {
    render(<EvidenceComparison rows={rows} />);
    fireEvent.click(
      screen.getByText("Compare national statistics and their evidence")
    );
    const row = screen.getByRole("row", { name: YEAR });
    expect(within(row).getByText("40,000")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Official-data-only view"));
    expect(within(row).getByText("Withheld")).toBeInTheDocument();
    expect(within(row).queryByText("0")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "seats" },
    });
    expect(within(row).getByText("15")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Official-data-only view"));
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "votes" },
    });
    expect(within(row).getByText("40,000")).toBeInTheDocument();
  });
});
