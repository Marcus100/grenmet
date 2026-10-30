import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FlightsPageBoard } from "@/components/flights-page-board";

const LAURISTON_DEPARTURES_RE = /lauriston airport.*departures/iu;
const GND_ARRIVALS_RE = /maurice bishop.*arrivals/iu;

let search = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

describe("FlightsPageBoard", () => {
  beforeEach(() => {
    search = "";
  });

  it("defaults to GND arrivals without query params", () => {
    render(<FlightsPageBoard />);
    expect(
      screen.getByRole("region", { name: GND_ARRIVALS_RE })
    ).toBeInTheDocument();
  });

  it("honours the board and airport deep link", () => {
    search = "board=departures&airport=CRU";
    render(<FlightsPageBoard />);
    expect(
      screen.getByRole("region", { name: LAURISTON_DEPARTURES_RE })
    ).toBeInTheDocument();
  });

  it("ignores invalid query values", () => {
    search = "board=nope&airport=XXX";
    render(<FlightsPageBoard />);
    expect(
      screen.getByRole("region", { name: GND_ARRIVALS_RE })
    ).toBeInTheDocument();
  });
});
