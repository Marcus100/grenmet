import type { OvertimeBandPublic } from "@barrelsgd/api-client";

function trim(value: string | number): string {
  return String(Number(value));
}

/** "2 h at 1.5x · 1 h at 2x", or "None" (#380). Hours only, never pay. */
export function overtimeBandsText(
  bands: readonly OvertimeBandPublic[] | undefined
): string {
  if (!bands || bands.length === 0) return "None";
  return bands
    .map((band) => `${trim(band.hours)} h at ${trim(band.rate)}x`)
    .join(" · ");
}

export function OvertimeBands({
  bands,
}: {
  bands: readonly OvertimeBandPublic[] | undefined;
}) {
  return <>Overtime by rate: {overtimeBandsText(bands)}</>;
}
