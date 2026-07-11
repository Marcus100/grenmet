"use client";

import { cn } from "@grenmet/ui/lib/utils";
import { PlaneLanding, PlaneTakeoff } from "lucide-react";
import { useState } from "react";
import {
  AIRPORTS,
  type AirportCode,
  type Board,
  type Flight,
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
            "flex items-center gap-2 rounded-full px-4 py-1.5 font-medium text-sm transition-colors",
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
            "rounded-full border px-3.5 py-1.5 font-medium text-xs transition-colors",
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

export function FlightBoard({
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
}) {
  const [board, setBoard] = useState<Board>(initialBoard);
  const [airport, setAirport] = useState<AirportCode>(initialAirport);
  const rows = flightsFor(flights, airport, board);
  const visible = compact ? rows.slice(0, 5) : rows;
  const routeLabel = board === "arrivals" ? "From" : "To";

  return (
    <section
      aria-label={`${AIRPORTS[airport].name} ${board}`}
      className="overflow-hidden rounded-2xl bg-gaa-navy-ink text-white shadow-xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
        <BoardToggle board={board} onChange={setBoard} />
        {compact ? null : (
          <AirportToggle airport={airport} onChange={setAirport} />
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-white/10 border-t text-white/50 text-xs uppercase tracking-wider">
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
                className="px-5 py-3 text-right font-medium sm:px-6"
                scope="col"
              >
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((flight) => (
              <tr
                className="border-white/10 border-t transition-colors hover:bg-white/5"
                key={`${flight.flightNumber}-${flight.board}-${flight.scheduled}`}
              >
                <td className="tabular px-5 py-3.5 font-display font-semibold text-base sm:px-6">
                  {flight.scheduled}
                </td>
                <td className="tabular px-3 py-3.5 text-white/85">
                  {flight.flightNumber}
                </td>
                <td className="px-3 py-3.5">
                  <span className="text-white/90">{flight.city}</span>{" "}
                  <span className="text-white/45 text-xs">
                    {flight.cityCode}
                  </span>
                </td>
                <td className="hidden px-3 py-3.5 text-white/70 md:table-cell">
                  {flight.airline}
                </td>
                <td className="px-5 py-3.5 text-right sm:px-6">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2.5 py-1 font-medium text-xs",
                      STATUS_STYLES[flight.status]
                    )}
                  >
                    {STATUS_LABELS[flight.status]}
                  </span>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr className="border-white/10 border-t">
                <td className="px-5 py-8 text-center text-white/60" colSpan={5}>
                  No {board} listed for {AIRPORTS[airport].shortName} today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-white/10 border-t px-5 py-3 text-white/40 text-xs sm:px-6">
        Sample schedule shown — live flight status is coming soon. Always
        confirm times with your airline.
      </p>
    </section>
  );
}
