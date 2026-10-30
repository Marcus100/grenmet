"use client";

import { SECTORS, type SectorKey } from "@barrelsgd/gms/sectors";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import { cn } from "@barrelsgd/ui/lib/utils";
import { useId } from "react";

/**
 * Which sectors an alert or warning affects, for "Plan your week" on the
 * weather site. Leaving every box clear means it affects everyone, and the
 * note under the boxes says so. Shared by the warning editor and bulletins.
 */
export function SectorCheckboxes({
  className,
  onChange,
  value,
}: {
  className?: string;
  onChange: (next: SectorKey[]) => void;
  value: readonly SectorKey[];
}) {
  const id = useId();
  const toggle = (key: SectorKey, on: boolean) =>
    onChange(
      SECTORS.map((sector) => sector.value).filter((candidate) =>
        candidate === key ? on : value.includes(candidate)
      )
    );
  return (
    <fieldset className={cn("grid gap-2", className)}>
      <legend className="font-semibold text-sm">Sectors affected</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {SECTORS.map(({ value: key, label }) => {
          const boxId = `${id}-${key}`;
          return (
            <label
              className="flex cursor-pointer items-center gap-2 text-sm"
              htmlFor={boxId}
              key={key}
            >
              <Checkbox
                checked={value.includes(key)}
                id={boxId}
                onCheckedChange={(checked) => toggle(key, checked === true)}
              />
              {label}
            </label>
          );
        })}
      </div>
      <p className="text-gm-text-muted text-xs">
        {value.length === 0
          ? "None ticked: shows under every sector as “Affects everyone”."
          : "Shows only under the ticked sectors in Plan your week."}
      </p>
    </fieldset>
  );
}
