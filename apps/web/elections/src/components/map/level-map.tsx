import type { GeoFile } from "@/data/types";
import { FlatMap, type MapRegion } from "./flat-map";
import { MapLevelView } from "./map-level-view";

/** Callers supply separately calculated measures at each geographic level. */
export function LevelMap({
  geo,
  label,
  constituencyRegions,
  divisionRegions = [],
  unavailableReason,
  defaultLevel,
  className,
}: {
  geo: GeoFile;
  label: string;
  constituencyRegions: MapRegion[];
  divisionRegions?: MapRegion[];
  unavailableReason?: string;
  defaultLevel?: "cons" | "div";
  className?: string;
}) {
  const located = divisionRegions.filter((r) => {
    const shape = geo.divisions[r.code];
    return (
      shape?.located &&
      shape.cons === r.code.charAt(0) &&
      shape.rings.length > 0
    );
  });
  const locatedCodes = new Set(located.map((r) => r.code));
  const omitted = divisionRegions
    .filter((r) => !locatedCodes.has(r.code))
    .map((r) => r.code);
  return (
    <MapLevelView
      className={className}
      constituencyMap={
        <FlatMap
          geo={geo}
          label={`${label} — constituencies`}
          regions={constituencyRegions}
        />
      }
      defaultLevel={defaultLevel}
      divisionMap={
        located.length > 0 ? (
          <FlatMap
            geo={geo}
            label={`${label} — polling divisions`}
            level="div"
            regions={located}
          />
        ) : undefined
      }
      omitted={omitted}
      unavailableReason={
        unavailableReason ??
        (divisionRegions.length > 0
          ? "Polling-division boundaries are unavailable for these records."
          : undefined)
      }
    />
  );
}
