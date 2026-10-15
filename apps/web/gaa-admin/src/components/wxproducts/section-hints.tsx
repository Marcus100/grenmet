import type { ProductValues } from "@barrelsgd/gms/products";
import { parameterKey } from "@barrelsgd/gms/products";
import {
  metresHint,
  nauticalMilesHint,
  windHint,
} from "@/lib/wxproducts/units";

/** Plain-language unit conversions shown under a section's fields. */
export function SectionHints({
  group,
  prefix,
  values,
}: {
  group: string;
  prefix: string;
  values: ProductValues;
}) {
  const k = (name: string) => parameterKey(prefix, name);
  return (
    <>
      {group === "Wind" &&
      windHint(
        values[k("windSpeedMin")],
        values[k("windSpeedMax")],
        values[k("windGust")]
      ) ? (
        <p className="text-muted-foreground text-xs">
          {windHint(
            values[k("windSpeedMin")],
            values[k("windSpeedMax")],
            values[k("windGust")]
          )}
        </p>
      ) : null}
      {group === "Marine" &&
      metresHint(values[k("waveHeightMin")], values[k("waveHeightMax")]) ? (
        <p className="text-muted-foreground text-xs">
          Waves{" "}
          {metresHint(values[k("waveHeightMin")], values[k("waveHeightMax")])}
          {values[k("swellHeight")]
            ? ` · swell ${metresHint(values[k("swellHeight")])}`
            : ""}
        </p>
      ) : null}
      {group === "Visibility" &&
      nauticalMilesHint(
        values[k("visibilityMin")],
        values[k("visibilityMax")]
      ) ? (
        <p className="text-muted-foreground text-xs">
          {nauticalMilesHint(
            values[k("visibilityMin")],
            values[k("visibilityMax")]
          )}
        </p>
      ) : null}
    </>
  );
}
