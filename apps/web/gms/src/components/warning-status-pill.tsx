import { CircleDashedIcon } from "lucide-react";
import Link from "next/link";
import { AlertsIcon, AlertsSummary } from "@/components/alerts-summary";
import { CHECKING_ALERTS } from "@/components/with-alerts";
import {
  type AlertsResult,
  alertsDisplayLevel,
  type GreenStatus,
} from "@/lib/cap-alerts";
import { cn } from "@/lib/utils";
import { WARNING_LEVEL_SURFACE } from "@/lib/warning-level";

/**
 * The masthead's live warning status: colour, icon and the shared wording.
 * Phones show icon and colour only (owner decision, 30 Sep 2026); where the
 * bar has room the words show too, so the status never relies on colour and
 * an icon alone (owner, 10 Nov 2026). Screen readers always hear the words.
 */
const PILL =
  "h-10 items-center gap-2 whitespace-nowrap rounded-md px-3 font-bold text-body leading-body";

/**
 * The pill's place-holder while the feed has not answered: same box, so the
 * masthead does not shift, and neutral, so it reads as neither all-clear nor
 * outage. Still a link: the Alerts page is the place to look either way.
 */
export function CheckingStatusPill({ className }: { className?: string }) {
  return (
    <Link
      className={cn(
        PILL,
        "bg-gm-text-inverse/10 text-gm-text-inverse",
        className
      )}
      href="/alerts"
    >
      <CircleDashedIcon aria-hidden="true" className="size-4 shrink-0" />
      <span className="sr-only">{CHECKING_ALERTS}</span>
    </Link>
  );
}

/** Breakpoint from which the words are shown; below it they are for screen readers only. */
const WORDS_FROM = {
  lg: "sr-only lg:not-sr-only",
  xl: "sr-only xl:not-sr-only",
} as const;

export function WarningStatusPill({
  alerts,
  green,
  className,
  wordsFrom,
}: {
  alerts: AlertsResult;
  green?: GreenStatus;
  className?: string;
  /** Show the words from this width up; screen readers only when omitted. */
  wordsFrom?: keyof typeof WORDS_FROM;
}) {
  return (
    <Link
      className={cn(
        PILL,
        WARNING_LEVEL_SURFACE[alertsDisplayLevel(alerts, green)],
        className
      )}
      href="/alerts"
    >
      <AlertsIcon alerts={alerts} className="size-4" green={green} />
      <AlertsSummary
        alerts={alerts}
        className={wordsFrom ? WORDS_FROM[wordsFrom] : undefined}
        green={green}
      />
    </Link>
  );
}
