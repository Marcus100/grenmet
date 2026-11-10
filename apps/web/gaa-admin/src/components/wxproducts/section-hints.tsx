import type { ProductValues } from "@barrelsgd/gms/products";
import { parameterKey } from "@barrelsgd/gms/products";
import {
  feetHint,
  metresHint,
  nauticalMilesHint,
  windHint,
} from "@/lib/wxproducts/units";

/** Plain-language unit conversions shown under a section's fields. */
export function SectionHints({
  group,
  marine = false,
  prefix,
  values,
}: {
  group: string;
  /** Marine products are entered in knots and metres; hint mph and feet. */
  marine?: boolean;
  prefix: string;
  values: ProductValues;
}) {
  const k = (name: string) => parameterKey(prefix, name);
  const wind = windHint(
    values[k("windSpeedMin")],
    values[k("windSpeedMax")],
    values[k("windGust")],
    marine
  );
  const heightHint = marine ? feetHint : metresHint;
  const waves = heightHint(
    values[k("waveHeightMin")],
    values[k("waveHeightMax")]
  );
  const visibility = nauticalMilesHint(
    values[k("visibilityMin")],
    values[k("visibilityMax")]
  );
  return (
    <>
      {group === "Wind" && wind ? (
        <p className="text-muted-foreground text-xs">{wind}</p>
      ) : null}
      {isSeaGroup(group) && waves ? (
        <p className="text-muted-foreground text-xs">
          Waves {waves}
          {values[k("swellHeight")]
            ? ` · swell ${heightHint(values[k("swellHeight")])}`
            : ""}
        </p>
      ) : null}
      {group === "Visibility" && visibility ? (
        <p className="text-muted-foreground text-xs">{visibility}</p>
      ) : null}
    </>
  );
}

/** The sea-state section: "Marine" on forecasts and alerts, "Seas and swell" on the Marine Forecast. */
export function isSeaGroup(group: string) {
  return group === "Marine" || group === "Seas and swell";
}
