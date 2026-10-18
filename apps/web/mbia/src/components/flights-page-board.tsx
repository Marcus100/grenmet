"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { FlightBoard } from "@/components/flight-board";
import {
  type FlightData,
  isAirportCode,
  isBoard,
  SAMPLE_DATA,
} from "@/lib/flights";

function BoardFromUrl({ data }: { data: FlightData }) {
  const params = useSearchParams();
  const board = params.get("board") ?? undefined;
  const airport = params.get("airport") ?? undefined;
  return (
    <FlightBoard
      fetchedAt={data.fetchedAt}
      flights={data.flights}
      initialAirport={isAirportCode(airport) ? airport : "GND"}
      initialBoard={isBoard(board) ? board : "arrivals"}
      source={data.source}
    />
  );
}

/**
 * Reads the `?board=&airport=` deep link in the browser so `/flights` can be
 * prerendered and cached at the CDN instead of rendered per request. The
 * fallback is the default (GND arrivals) board.
 */
export function FlightsPageBoard({
  data = SAMPLE_DATA,
}: {
  data?: FlightData;
}) {
  return (
    <Suspense
      fallback={
        <FlightBoard
          fetchedAt={data.fetchedAt}
          flights={data.flights}
          source={data.source}
        />
      }
    >
      <BoardFromUrl data={data} />
    </Suspense>
  );
}
