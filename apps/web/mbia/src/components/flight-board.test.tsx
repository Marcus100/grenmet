import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FlightBoard } from "@/components/flight-board";
import type { Flight } from "@/lib/flights";

const DEPARTURES_RE = /departures/iu;
const LAURISTON_RE = /lauriston/iu;
const SAMPLE_RE = /sample data/iu;
const RECENT_RE = /recent movements.*not a live board/iu;
const NO_ARRIVALS_RE = /no arrivals listed/iu;

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

  it("labels the default board as sample data", () => {
    render(<FlightBoard flights={FLIGHTS} />);
    expect(screen.getByText(SAMPLE_RE)).toBeInTheDocument();
  });

  it("says plainly that the sample schedule is not live flights", () => {
    render(<FlightBoard flights={FLIGHTS} />);
    expect(
      screen.getByText("Sample schedule, not live flights.")
    ).toBeInTheDocument();
  });

  it("does not call provider data a sample schedule", () => {
    render(<FlightBoard flights={FLIGHTS} source="opensky" />);
    expect(
      screen.queryByText("Sample schedule, not live flights.")
    ).not.toBeInTheDocument();
  });

  it("keeps the status visible on phones and scrolls inside its own box", () => {
    render(<FlightBoard flights={FLIGHTS} />);
    const inline = screen.getByTestId("status-inline");
    expect(inline).toHaveTextContent("On time");
    expect(inline.className).toContain("sm:hidden");
    const scroller = screen.getByTestId("flight-table-scroll");
    expect(scroller.className).toContain("overflow-x-auto");
  });

  it("labels provider data as recent movements, not sample or live", () => {
    render(
      <FlightBoard
        fetchedAt="2026-10-18T12:00:00Z"
        flights={FLIGHTS}
        source="opensky"
      />
    );
    expect(screen.getByText(RECENT_RE)).toBeInTheDocument();
    expect(screen.queryByText(SAMPLE_RE)).not.toBeInTheDocument();
  });
});
