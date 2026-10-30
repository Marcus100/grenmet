"use client";

import { cn } from "@barrelsgd/ui/lib/utils";
import { PlaneLanding, PlaneTakeoff } from "lucide-react";
import { useState } from "react";
import {
  AIRPORTS,
  type AirportCode,
  type Board,
  type Flight,
  type FlightSource,
  type FlightStatus,
  flightsFor,
  STATUS_LABELS,
} from "@/lib/flights";

const STATUS_STYLES: Record<FlightStatus, string> = {
  scheduled: "bg-white/10 text-white/80",
  "on-time": "bg-gaa-status-ontime/20 text-emerald-300",
  boarding: "bg-gaa-sea/25 text-sky-300",
  departed: "bg-white/10 text-white/60",
  landed: "bg-white/10 text-white/60",
  delayed: "bg-gaa-status-delayed/25 text-amber-300",
  cancelled: "bg-gaa-status-cancelled/25 text-red-300",
};

function BoardToggle({
  board,
  onChange,
}: {
  board: Board;
  onChange: (board: Board) => void;
}) {
  return (
    <div className="flex rounded-full bg-white/10 p-1" role="tablist">
      {(
        [
          ["arrivals", "Arrivals", PlaneLanding],
          ["departures", "Departures", PlaneTakeoff],
        ] as const
      ).map(([value, label, Icon]) => (
        <button
          aria-selected={board === value}
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            board === value
              ? "bg-gaa-gold text-gaa-navy-ink"
              : "text-white/70 hover:text-white"
          )}
          key={value}
          onClick={() => onChange(value)}
          role="tab"
          type="button"
        >
          <Icon aria-hidden="true" className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

function AirportToggle({
  airport,
  onChange,
}: {
  airport: AirportCode;
  onChange: (airport: AirportCode) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {(Object.keys(AIRPORTS) as AirportCode[]).map((code) => (
        <button
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
            airport === code
              ? "border-gaa-gold bg-gaa-gold/15 text-gaa-gold"
              : "border-white/20 text-white/70 hover:border-white/40 hover:text-white"
          )}
          key={code}
          onClick={() => onChange(code)}
          type="button"
        >
          {AIRPORTS[code].shortName} · {code}
        </button>
      ))}
    </div>
  );
}

const updatedFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: "America/Grenada",
});

function SourceBanner({
  fetchedAt,
  source,
}: {
  fetchedAt?: string;
  source: FlightSource;
}) {
  if (source === "sample") {
    return (
      <p className="border-b border-white/10 px-5 py-3 text-sm sm:px-6">
        <strong className="text-gaa-gold font-semibold">
          Sample schedule, not live flights.
        </strong>{" "}
        Times and statuses are sample data. Confirm your flight with your
        airline.
      </p>
    );
  }
  const updated = fetchedAt
    ? ` Updated ${updatedFormat.format(new Date(fetchedAt))} (Grenada time).`
    : "";
  return (
    <p className="border-b border-white/10 px-5 py-3 text-sm sm:px-6">
      Recent movements at Maurice Bishop International from OpenSky Network
      (research data). This is not a live board or a schedule: it lists aircraft
      seen on the previous day or earlier, with the time they were seen.
      {updated} Confirm your flight with your airline.
    </p>
  );
}

export function FlightBoard({
  fetchedAt,
  source = "sample",
  flights,
  initialAirport = "GND",
  initialBoard = "arrivals",
  compact = false,
}: {
  flights: Flight[];
  initialAirport?: AirportCode;
  initialBoard?: Board;
  /** Homepage preview: fewer rows, no airport toggle. */
  compact?: boolean;
  fetchedAt?: string;
  source?: FlightSource;
}) {
  const [board, setBoard] = useState<Board>(initialBoard);
  const [airport, setAirport] = useState<AirportCode>(initialAirport);
  const rows = flightsFor(flights, airport, board);
  const visible = compact ? rows.slice(0, 5) : rows;
  const routeLabel = board === "arrivals" ? "From" : "To";

  return (
    <section
      aria-label={`${AIRPORTS[airport].name} ${board}`}
      className="bg-gaa-navy-ink overflow-hidden rounded-2xl text-white shadow-xl"
    >
      <SourceBanner fetchedAt={fetchedAt} source={source} />
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
        <BoardToggle board={board} onChange={setBoard} />
        {compact ? null : (
          <AirportToggle airport={airport} onChange={setAirport} />
        )}
      </div>
      {/* Scrolls sideways inside its own box if a row is ever wider than the phone. */}
      <div className="overflow-x-auto" data-testid="flight-table-scroll">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-t border-white/10 text-xs tracking-wider text-white/50 uppercase">
              <th className="px-5 py-3 font-medium sm:px-6" scope="col">
                Time
              </th>
              <th className="px-3 py-3 font-medium" scope="col">
                Flight
              </th>
              <th className="px-3 py-3 font-medium" scope="col">
                {routeLabel}
              </th>
              <th
                className="hidden px-3 py-3 font-medium md:table-cell"
                scope="col"
              >
                Airline
              </th>
              <th
                className="hidden px-5 py-3 text-right font-medium sm:table-cell sm:px-6"
                scope="col"
              >
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((flight) => (
              <tr
                className="border-t border-white/10 transition-colors hover:bg-white/5"
                key={`${flight.flightNumber}-${flight.board}-${flight.scheduled}`}
              >
                <td className="tabular font-display px-5 py-3.5 text-base font-semibold sm:px-6">
                  {flight.scheduled}
                </td>
                <td className="tabular px-3 py-3.5 text-white/85">
                  {flight.flightNumber}
                  {/* Phones: status sits under the flight number so it is never clipped. */}
                  <span
                    className={cn(
                      "mt-1 block w-fit rounded-full px-2 py-0.5 text-xs font-medium sm:hidden",
                      STATUS_STYLES[flight.status]
                    )}
                    data-testid="status-inline"
                  >
                    {STATUS_LABELS[flight.status]}
                  </span>
                </td>
                <td className="px-3 py-3.5">
                  <span className="break-words text-white/90">
                    {flight.city}
                  </span>{" "}
                  <span className="text-xs text-white/45">
                    {flight.cityCode}
                  </span>
                </td>
                <td className="hidden px-3 py-3.5 text-white/70 md:table-cell">
                  {flight.airline}
                </td>
                <td className="hidden px-5 py-3.5 text-right sm:table-cell sm:px-6">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2.5 py-1 text-xs font-medium",
                      STATUS_STYLES[flight.status]
                    )}
                  >
                    {STATUS_LABELS[flight.status]}
                  </span>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr className="border-t border-white/10">
                <td className="px-5 py-8 text-center text-white/60" colSpan={5}>
                  {source === "sample"
                    ? `No ${board} listed for ${AIRPORTS[airport].shortName} today.`
                    : `No recent ${board} available for ${AIRPORTS[airport].shortName}.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
