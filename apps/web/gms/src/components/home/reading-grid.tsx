import type { LucideIcon } from "lucide-react";
import {
  ArrowDownIcon,
  ArrowDownToLineIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ArrowUpToLineIcon,
  CloudDrizzleIcon,
  CloudIcon,
  DropletIcon,
  DropletsIcon,
  EyeIcon,
  GaugeIcon,
  LeafIcon,
  SunMediumIcon,
  SunriseIcon,
  SunsetIcon,
  UmbrellaIcon,
  WavesHorizontalIcon,
  WavesIcon,
  WindArrowDownIcon,
  WindIcon,
} from "lucide-react";
import type { PressureTrend, Reading, ReadingIcon } from "@/lib/hero-readings";
import { cn } from "@/lib/utils";

const ICONS: Record<ReadingIcon, LucideIcon> = {
  air: LeafIcon,
  cloud: CloudIcon,
  dew: DropletIcon,
  gusts: WindArrowDownIcon,
  humidity: DropletsIcon,
  pressure: GaugeIcon,
  rain: UmbrellaIcon,
  rainfall: CloudDrizzleIcon,
  seas: WavesIcon,
  sunrise: SunriseIcon,
  sunset: SunsetIcon,
  swell: WavesHorizontalIcon,
  "tide-high": ArrowUpToLineIcon,
  "tide-low": ArrowDownToLineIcon,
  uv: SunMediumIcon,
  visibility: EyeIcon,
  wind: WindIcon,
};

/** Water readings take sky, the sun's take lime; the rest stay white. */
const TINT: Partial<Record<ReadingIcon, string>> = {
  dew: "text-gm-sky",
  humidity: "text-gm-sky",
  rain: "text-gm-sky",
  rainfall: "text-gm-sky",
  seas: "text-gm-sky",
  swell: "text-gm-sky",
  "tide-high": "text-gm-sky",
  "tide-low": "text-gm-sky",
  sunrise: "text-gm-lime",
  sunset: "text-gm-lime",
  uv: "text-gm-lime",
};

const TREND: Record<PressureTrend, LucideIcon> = {
  falling: ArrowDownIcon,
  rising: ArrowUpIcon,
  steady: ArrowRightIcon,
};

function Trend({ trend }: { trend: PressureTrend }) {
  const Arrow = TREND[trend];
  return (
    <>
      <Arrow
        aria-hidden="true"
        className="ml-1 inline size-4 align-[-0.125em] text-gm-lime"
        strokeWidth={2.6}
      />
      <span className="sr-only">, {trend}</span>
    </>
  );
}

/**
 * The sky hero's reading grid: each item is an icon, the value (with an
 * optional small qualifier), then its label. Two columns on phones, more as
 * the panel widens. Air quality spans the row on phones, its level as the
 * value and the index on the right.
 */
export function ReadingGrid({
  className,
  readings,
}: {
  className?: string;
  readings: Reading[];
}) {
  if (readings.length === 0) return null;
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-3 gap-y-4 border-gm-text-inverse/15 border-t pt-4 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] lg:gap-y-5",
        className
      )}
    >
      {readings.map((reading) => {
        const Icon = ICONS[reading.icon];
        const quality = reading.tag !== undefined;
        return (
          <div
            className={cn(
              "grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_auto] content-start items-start gap-x-2.5 lg:grid-cols-[2rem_minmax(0,1fr)_auto]",
              quality &&
                "col-span-2 items-center rounded-lg bg-gm-scrim px-3 py-2.5 sm:col-span-1 sm:bg-transparent sm:p-0"
            )}
            key={reading.label}
          >
            <Icon
              aria-hidden="true"
              className={cn(
                "row-span-3 mt-0.5 size-6 lg:size-7",
                TINT[reading.icon] ?? "text-gm-text-inverse"
              )}
              strokeWidth={1.6}
            />
            <dd className="col-start-2 row-start-1 font-bold text-body-base tabular-nums leading-body-base lg:text-heading-sm lg:leading-heading-sm">
              {quality ? reading.tag : reading.value}
              {reading.trend && <Trend trend={reading.trend} />}
            </dd>
            {reading.detail && (
              <dd className="col-start-2 row-start-2 font-semibold text-caption leading-caption">
                {reading.detail}
              </dd>
            )}
            <dt className="col-start-2 row-start-3 text-body-sm text-gm-text-inverse/85 leading-body-sm">
              {reading.label}
            </dt>
            {quality && (
              <dd className="col-start-3 row-span-3 row-start-1 grid justify-items-end font-bold text-heading-sm tabular-nums leading-heading-sm">
                {reading.value.replace(" AQI", "")}
                <span className="font-normal text-caption leading-caption">
                  AQI
                </span>
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}
