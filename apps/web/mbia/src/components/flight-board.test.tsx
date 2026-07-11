import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FlightBoard } from "@/components/flight-board";
import type { Flight } from "@/lib/flights";

const DEPARTURES_RE = /departures/i;
const LAURISTON_RE = /lauriston/i;
const NO_ARRIVALS_RE = /no arrivals listed/i;

const FLIGHTS: Flight[] = [
  {
    airline: "American Airlines",
    flightNumber: "AA 1509",
    city: "Miami",
    cityCode: "MIA",
    airport: "GND",
    board: "arrivals",
    scheduled: "13:25",
    status: "on-time",
  },
  {
    airline: "JetBlue",
    flightNumber: "B6 1862",
    city: "New York–JFK",
    cityCode: "JFK",
    airport: "GND",
    board: "departures",
    scheduled: "15:20",
    status: "delayed",
  },
  {
    airline: "SVG Air",
    flightNumber: "SVD 211",
    city: "Grenada",
    cityCode: "GND",
    airport: "CRU",
    board: "arrivals",
    scheduled: "09:15",
    status: "landed",
  },
];

describe("FlightBoard", () => {
  it("shows arrivals for MBIA by default", () => {
    render(<FlightBoard flights={FLIGHTS} />);
    expect(screen.getByText("AA 1509")).toBeInTheDocument();
    expect(screen.queryByText("B6 1862")).not.toBeInTheDocument();
  });

  it("switches to departures", async () => {
    const user = userEvent.setup();
    render(<FlightBoard flights={FLIGHTS} />);
    await user.click(screen.getByRole("tab", { name: DEPARTURES_RE }));
    expect(screen.getByText("B6 1862")).toBeInTheDocument();
    expect(screen.queryByText("AA 1509")).not.toBeInTheDocument();
  });

  it("switches airports to Lauriston", async () => {
    const user = userEvent.setup();
    render(<FlightBoard flights={FLIGHTS} />);
    await user.click(screen.getByRole("button", { name: LAURISTON_RE }));
    expect(screen.getByText("SVD 211")).toBeInTheDocument();
  });

  it("hides the airport toggle in compact mode", () => {
    render(<FlightBoard compact flights={FLIGHTS} />);
    expect(
      screen.queryByRole("button", { name: LAURISTON_RE })
    ).not.toBeInTheDocument();
  });

  it("shows an empty state when no flights match", () => {
    render(<FlightBoard flights={[]} />);
    expect(screen.getByText(NO_ARRIVALS_RE)).toBeInTheDocument();
  });
});
