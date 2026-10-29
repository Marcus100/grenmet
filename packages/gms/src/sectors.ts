/**
 * The sectors a warning or alert can be tagged with, so the weather site's
 * "Plan your week" shows each sector what applies to it (owner, 28 Oct 2026).
 * The same list lives in `apps/api/fastapi/src/sectors.py`; a test keeps the
 * two equal. A warning carries them in the CAP parameter `GMS:sectors` and a
 * bulletin in its `sectors` value, both as comma-separated keys.
 */
export const SECTORS = [
  { value: "tourism", label: "Tourism & outdoors" },
  { value: "marine", label: "Marine" },
  { value: "aviation", label: "Aviation" },
  { value: "agriculture", label: "Agriculture" },
  { value: "health", label: "Health" },
  { value: "roads-transport", label: "Roads & transport" },
] as const;

export type SectorKey = (typeof SECTORS)[number]["value"];

const SEPARATOR = ",";

export const isSectorKey = (value: string): value is SectorKey =>
  SECTORS.some((sector) => sector.value === value);

/** The known sectors in a stored list, in menu order, each once. Unknown names are dropped. */
export function parseSectors(value: string | null | undefined): SectorKey[] {
  const wanted = new Set(
    (value ?? "")
      .split(SEPARATOR)
      .map((part) => part.trim())
      .filter(isSectorKey)
  );
  return SECTORS.map((sector) => sector.value).filter((key) => wanted.has(key));
}

/** The stored form: keys in menu order, comma-separated; empty means untagged. */
export function formatSectors(sectors: readonly SectorKey[]): string {
  return parseSectors(sectors.join(",")).join(",");
}

export const sectorLabel = (key: SectorKey): string =>
  SECTORS.find((sector) => sector.value === key)?.label ?? key;
