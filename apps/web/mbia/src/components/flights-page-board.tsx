"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { FlightBoard } from "@/components/flight-board";
import { isAirportCode, isBoard, SAMPLE_FLIGHTS } from "@/lib/flights";

function BoardFromUrl() {
  const params = useSearchParams();
  const board = params.get("board") ?? undefined;
  const airport = params.get("airport") ?? undefined;
  return (
    <FlightBoard
      flights={SAMPLE_FLIGHTS}
      initialAirport={isAirportCode(airport) ? airport : "GND"}
      initialBoard={isBoard(board) ? board : "arrivals"}
    />
  );
}

/**
 * Reads the `?board=&airport=` deep link in the browser so `/flights` can be
 * prerendered and cached at the CDN instead of rendered per request. The
 * fallback is the default (GND arrivals) board.
 */
export function FlightsPageBoard() {
  return (
    <Suspense fallback={<FlightBoard flights={SAMPLE_FLIGHTS} />}>
      <BoardFromUrl />
    </Suspense>
  );
}
