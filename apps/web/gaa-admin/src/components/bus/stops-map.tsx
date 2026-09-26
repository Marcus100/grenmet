"use client";

import type { TransportStop } from "@barrelsgd/api-client";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Marker } from "react-map-gl/maplibre";
import { CapMap } from "@/components/cap/cap-map";

export interface StopPin {
  id: number | "picked";
  latitude: number;
  longitude: number;
  name: string;
}

export function mappedStops(stops: TransportStop[]): StopPin[] {
  return stops.flatMap((stop) =>
    stop.latitude != null && stop.longitude != null
      ? [
          {
            id: stop.id,
            latitude: stop.latitude,
            longitude: stop.longitude,
            name: stop.name,
          },
        ]
      : []
  );
}

/**
 * Stops on the bundled Grenada basemap (no tile CDN — see CapMap). With
 * `onPick`, a click anywhere reports the clicked location.
 */
export function StopsMap({
  height = 360,
  highlightId,
  onPick,
  onSelect,
  pins,
}: {
  height?: number;
  highlightId?: number | "picked" | null;
  onPick?: (location: { latitude: number; longitude: number }) => void;
  onSelect?: (id: number) => void;
  pins: StopPin[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <CapMap
        cursor={onPick ? "crosshair" : undefined}
        height={height}
        interactiveLayerIds={[]}
        onClick={(event) =>
          onPick?.({
            latitude: Number(event.lngLat.lat.toFixed(6)),
            longitude: Number(event.lngLat.lng.toFixed(6)),
          })
        }
      >
        {pins.map((pin) => (
          <Marker
            anchor="center"
            key={pin.id}
            latitude={pin.latitude}
            longitude={pin.longitude}
            onClick={(event) => {
              event.originalEvent.stopPropagation();
              if (typeof pin.id === "number") onSelect?.(pin.id);
            }}
          >
            <span
              className={cn(
                "block size-3 rounded-full border-2 border-background bg-primary shadow",
                pin.id === highlightId && "size-4 bg-destructive"
              )}
              title={pin.name}
            />
          </Marker>
        ))}
      </CapMap>
    </div>
  );
}
