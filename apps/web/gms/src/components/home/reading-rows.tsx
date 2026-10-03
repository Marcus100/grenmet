import type { LucideIcon } from "lucide-react";
import {
  ArrowDownToLineIcon,
  ArrowUpToLineIcon,
  DropletIcon,
  DropletsIcon,
  EyeIcon,
  GaugeIcon,
  LeafIcon,
  SunriseIcon,
  SunsetIcon,
  UmbrellaIcon,
  WavesIcon,
  WindArrowDownIcon,
  WindIcon,
} from "lucide-react";
import type { Reading, ReadingIcon } from "@/lib/hero-readings";
import { cn } from "@/lib/utils";

const ICONS: Record<ReadingIcon, LucideIcon> = {
  air: LeafIcon,
  dew: DropletIcon,
  gusts: WindArrowDownIcon,
  humidity: DropletsIcon,
  pressure: GaugeIcon,
  rain: UmbrellaIcon,
  seas: WavesIcon,
  sunrise: SunriseIcon,
  sunset: SunsetIcon,
  "tide-high": ArrowUpToLineIcon,
  "tide-low": ArrowDownToLineIcon,
  visibility: EyeIcon,
  wind: WindIcon,
};

/** Water readings take sky, the sun's take lime; the rest stay white. */
const TINT: Partial<Record<ReadingIcon, string>> = {
  dew: "text-gm-sky",
  humidity: "text-gm-sky",
  rain: "text-gm-sky",
  seas: "text-gm-sky",
  "tide-high": "text-gm-sky",
  "tide-low": "text-gm-sky",
  sunrise: "text-gm-lime",
  sunset: "text-gm-lime",
};

/**
 * Icon · value · label rows in two columns, the reading list shared by the
 * Now card and the day panel. Rows from `hideFrom` on are hidden on phones
 * (the caller folds them); desktop shows every row.
 */
export function ReadingRows({
  className,
  hideFrom,
  readings,
}: {
  className?: string;
  hideFrom?: number;
  readings: Reading[];
}) {
  if (readings.length === 0) return null;
  return (
    <dl
      className={cn(
        "grid grid-cols-2 border-gm-text-inverse/15 border-t",
        className
      )}
    >
      {readings.map((reading, index) => {
        const Icon = ICONS[reading.icon];
        return (
          <div
            className={cn(
              "grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2 border-gm-text-inverse/10 border-b py-1.5 odd:pr-2",
              hideFrom !== undefined && index >= hideFrom && "hidden lg:grid"
            )}
            key={reading.label}
          >
            <Icon
              aria-hidden="true"
              className={cn(
                "row-span-2 size-5",
                TINT[reading.icon] ?? "text-gm-text-inverse"
              )}
              strokeWidth={1.8}
            />
            <dt className="col-start-2 row-start-2 truncate text-caption text-gm-text-inverse/85 leading-caption">
              {reading.label}
            </dt>
            <dd className="col-start-2 row-start-1 truncate font-bold text-body tabular-nums leading-body">
              {reading.value}
            </dd>
            {reading.tag && (
              <dd className="col-start-3 row-span-2 row-start-1 rounded border border-gm-text-inverse/65 px-1.5 font-bold text-label leading-label">
                {reading.tag}
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}
