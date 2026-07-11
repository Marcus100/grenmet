/**
 * Flight information model + sample schedule.
 *
 * There is no live FIDS feed yet — this module is the seam where one plugs
 * in. `SAMPLE_FLIGHTS` mirrors the real carriers and routes that serve GND
 * and CRU so the board renders truthfully in shape, and every consumer goes
 * through the query helpers so swapping in a live source touches one file.
 */

export const AIRPORTS = {
  GND: {
    code: "GND",
    icao: "TGPY",
    name: "Maurice Bishop International Airport",
    shortName: "MBIA",
  },
  CRU: {
    code: "CRU",
    icao: "TGPZ",
    name: "Lauriston Airport",
    shortName: "Lauriston",
  },
} as const;

export type AirportCode = keyof typeof AIRPORTS;

export type Board = "arrivals" | "departures";

export type FlightStatus =
  | "scheduled"
  | "on-time"
  | "boarding"
  | "departed"
  | "landed"
  | "delayed"
  | "cancelled";

export interface Flight {
  airline: string;
  airport: AirportCode;
  board: Board;
  /** The other end of the route (origin for arrivals, destination for departures). */
  city: string;
  cityCode: string;
  flightNumber: string;
  /** Scheduled local time, 24h "HH:mm". */
  scheduled: string;
  status: FlightStatus;
}

export const STATUS_LABELS: Record<FlightStatus, string> = {
  scheduled: "Scheduled",
  "on-time": "On time",
  boarding: "Boarding",
  departed: "Departed",
  landed: "Landed",
  delayed: "Delayed",
  cancelled: "Cancelled",
};

export const SAMPLE_FLIGHTS: Flight[] = [
  // MBIA arrivals
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
    flightNumber: "B6 1861",
    city: "New York–JFK",
    cityCode: "JFK",
    airport: "GND",
    board: "arrivals",
    scheduled: "14:10",
    status: "on-time",
  },
  {
    airline: "Caribbean Airlines",
    flightNumber: "BW 418",
    city: "Port of Spain",
    cityCode: "POS",
    airport: "GND",
    board: "arrivals",
    scheduled: "15:05",
    status: "landed",
  },
  {
    airline: "Virgin Atlantic",
    flightNumber: "VS 89",
    city: "London–Heathrow",
    cityCode: "LHR",
    airport: "GND",
    board: "arrivals",
    scheduled: "15:40",
    status: "delayed",
  },
  {
    airline: "interCaribbean",
    flightNumber: "JY 762",
    city: "Bridgetown",
    cityCode: "BGI",
    airport: "GND",
    board: "arrivals",
    scheduled: "16:20",
    status: "scheduled",
  },
  {
    airline: "Air Canada",
    flightNumber: "AC 1804",
    city: "Toronto",
    cityCode: "YYZ",
    airport: "GND",
    board: "arrivals",
    scheduled: "17:55",
    status: "scheduled",
  },
  // MBIA departures
  {
    airline: "Caribbean Airlines",
    flightNumber: "BW 419",
    city: "Port of Spain",
    cityCode: "POS",
    airport: "GND",
    board: "departures",
    scheduled: "13:50",
    status: "boarding",
  },
  {
    airline: "American Airlines",
    flightNumber: "AA 1509",
    city: "Miami",
    cityCode: "MIA",
    airport: "GND",
    board: "departures",
    scheduled: "14:45",
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
    status: "on-time",
  },
  {
    airline: "British Airways",
    flightNumber: "BA 2158",
    city: "London–Gatwick",
    cityCode: "LGW",
    airport: "GND",
    board: "departures",
    scheduled: "16:35",
    status: "scheduled",
  },
  {
    airline: "Virgin Atlantic",
    flightNumber: "VS 90",
    city: "London–Heathrow",
    cityCode: "LHR",
    airport: "GND",
    board: "departures",
    scheduled: "17:10",
    status: "delayed",
  },
  {
    airline: "Sunrise Airways",
    flightNumber: "S6 703",
    city: "St. Lucia",
    cityCode: "UVF",
    airport: "GND",
    board: "departures",
    scheduled: "18:00",
    status: "scheduled",
  },
  // Lauriston (Carriacou)
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
  {
    airline: "SVG Air",
    flightNumber: "SVD 212",
    city: "Grenada",
    cityCode: "GND",
    airport: "CRU",
    board: "departures",
    scheduled: "09:45",
    status: "departed",
  },
  {
    airline: "SVG Air",
    flightNumber: "SVD 215",
    city: "Grenada",
    cityCode: "GND",
    airport: "CRU",
    board: "arrivals",
    scheduled: "16:30",
    status: "scheduled",
  },
  {
    airline: "SVG Air",
    flightNumber: "SVD 216",
    city: "Grenada",
    cityCode: "GND",
    airport: "CRU",
    board: "departures",
    scheduled: "17:00",
    status: "scheduled",
  },
];

export function flightsFor(
  flights: Flight[],
  airport: AirportCode,
  board: Board
): Flight[] {
  return flights
    .filter((f) => f.airport === airport && f.board === board)
    .sort((a, b) => a.scheduled.localeCompare(b.scheduled));
}

export function isBoard(value: string | undefined): value is Board {
  return value === "arrivals" || value === "departures";
}

export function isAirportCode(value: string | undefined): value is AirportCode {
  return value === "GND" || value === "CRU";
}
