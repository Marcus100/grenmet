import {
  type FlightBoardResponse,
  flightsGetFlightBoard,
} from "@barrelsgd/api-client";
import { env } from "@/lib/env";
import {
  type Board,
  type Flight,
  type FlightData,
  SAMPLE_DATA,
} from "@/lib/flights";
import { reportError } from "@/lib/report-error";

/** Re-fetch cadence. The backend polls OpenSky every 30 minutes. */
export const FLIGHTS_REVALIDATE_SECONDS = 1800;

const TIME_ZONE = "America/Grenada";

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: TIME_ZONE,
});

/**
 * Maps the API board to the web model. OpenSky has no schedule or airline, so
 * `scheduled` carries the local time the aircraft was seen, the flight number
 * is the callsign, and status is only ever "landed" or "departed".
 */
export function mapBoardResponse(
  response: FlightBoardResponse,
  board: Board
): Flight[] {
  return (response.rows ?? []).map((row) => {
    const seen = new Date(row.time);
    const other = row.other_airport_icao ?? "";
    return {
      airline: "",
      airport: "GND",
      board,
      city: other || "Unknown",
      cityCode: other,
      flightNumber: row.callsign ?? row.icao24 ?? "Unidentified",
      scheduled: timeFormat.format(seen).replace(",", ""),
      sortKey: seen.getTime(),
      status: board === "arrivals" ? "landed" : "departed",
    };
  });
}

async function fetchBoard(board: Board): Promise<FlightBoardResponse | null> {
  try {
    return await flightsGetFlightBoard({
      baseURL: env.AUTH_API_URL,
      options: { next: { revalidate: FLIGHTS_REVALIDATE_SECONDS } },
      query: { airport: "TGPY", board },
    }).unwrap();
  } catch (error) {
    // API down or rate limited: the labelled sample board is the fallback.
    reportError(error, "mbia-flights");
    return null;
  }
}

/**
 * Live data only when the API says it is available; otherwise the labelled
 * sample board. Never mixes sample and live rows.
 */
export async function loadFlightData(): Promise<FlightData> {
  const [arrivals, departures] = await Promise.all([
    fetchBoard("arrivals"),
    fetchBoard("departures"),
  ]);
  const live = [
    arrivals?.available ? arrivals : null,
    departures?.available ? departures : null,
  ];
  if (!(live[0] || live[1])) {
    return SAMPLE_DATA;
  }
  const fetchedAt = live
    .map((r) => r?.fetched_at)
    .filter((v): v is string => typeof v === "string")
    .sort()
    .at(0);
  return {
    fetchedAt,
    flights: [
      ...(live[0] ? mapBoardResponse(live[0], "arrivals") : []),
      ...(live[1] ? mapBoardResponse(live[1], "departures") : []),
    ],
    source: "opensky",
  };
}
