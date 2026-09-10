import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeatherReference } from "./weather-reference";

const NSC_PATTERN = /NSC Nil Significant Cloud/;
const MISSING_PATTERN = /Missing value/;
const SUBSET_PATTERN = /does not mean the descriptor is invalid/;
const IWXXM_PATTERN = /does not convert or validate IWXXM/;

describe("WeatherReference", () => {
  it("lets staff search a field and inspect the source code meanings", () => {
    render(<WeatherReference />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "0-20-009" },
    });
    expect(screen.getByText("1 matching fields")).toBeInTheDocument();
    expect(screen.getByText(NSC_PATTERN)).toBeInTheDocument();
    expect(screen.getByText(MISSING_PATTERN)).toBeInTheDocument();
  });
  it("explains the subset boundary for unmatched searches", () => {
    render(<WeatherReference />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "does-not-exist" },
    });
    expect(screen.getByText(SUBSET_PATTERN)).toBeInTheDocument();
  });
  it("links the supplied IWXXM resources and states current capabilities", () => {
    render(<WeatherReference />);
    expect(screen.getByText(IWXXM_PATTERN)).toBeInTheDocument();
    expect(screen.getByText("TAC-to-IWXXM conversion project")).toHaveAttribute(
      "href",
      "https://github.com/EMPIRIC2/TAC-to-IWXXM"
    );
    expect(
      screen.getByText("WMO IWXXM schemas and Schematron rules")
    ).toHaveAttribute("href", "https://github.com/wmo-im/iwxxm");
  });
});
