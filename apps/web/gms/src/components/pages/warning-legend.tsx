import { ArrowRightIcon, BellIcon } from "lucide-react";
import Link from "next/link";
import {
  WARNING_LEVEL_GUIDANCE,
  WARNING_LEVEL_LABEL,
  WARNING_LEVEL_SWATCH,
  type WarningLevel,
} from "@/lib/warning-level";

const LEVELS: WarningLevel[] = [
  "none",
  "be-aware",
  "be-prepared",
  "take-action",
  "unknown",
];

/** The five levels with swatch, name and guidance, then onward actions. */
export function WarningLegend() {
  return (
    <aside
      aria-labelledby="warning-legend-title"
      className="rounded-gm-card border-gm-border bg-background flex flex-col gap-3 self-start border p-4 lg:p-5"
    >
      <h2
        className="text-body-base text-gm-heading leading-body-base font-bold"
        id="warning-legend-title"
      >
        Alert levels
      </h2>
      <ul className="flex flex-col gap-3">
        {LEVELS.map((level) => (
          <li className="grid grid-cols-[2.25rem_1fr] gap-3" key={level}>
            <span
              aria-hidden="true"
              className={`h-5 rounded ${WARNING_LEVEL_SWATCH[level]}`}
            />
            <span className="text-body-sm leading-body-sm">
              <b className="text-gm-heading block">
                {WARNING_LEVEL_LABEL[level]}
              </b>
              {WARNING_LEVEL_GUIDANCE[level]}
            </span>
          </li>
        ))}
      </ul>
      <Link
        className="text-body text-gm-blue-ink leading-body flex items-center gap-1 font-semibold hover:underline"
        href="/alerts/levels"
      >
        How alerts work
        <ArrowRightIcon aria-hidden="true" className="size-4" />
      </Link>
      <Link
        className="bg-gm-blue-ink text-body text-gm-text-inverse leading-body dark:text-gm-navy flex h-11 items-center justify-center gap-2 rounded-md font-bold"
        href="/alerts/get-alerts"
      >
        <BellIcon aria-hidden="true" className="size-4" />
        Get alerts
      </Link>
    </aside>
  );
}
