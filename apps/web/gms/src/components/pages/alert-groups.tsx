import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import {
  type AlertsResult,
  type HazardGroup,
  type PublicAlert,
  severityLevel,
} from "@/lib/cap";
import { cn } from "@/lib/utils";
import { formatWarningTime, warningHref } from "@/lib/warning-detail";
import {
  WARNING_LEVEL_LABEL,
  WARNING_LEVEL_SURFACE,
  WARNING_LEVEL_SWATCH,
} from "@/lib/warning-level";

/**
 * One warning: a level stripe, the level in words, then what, where and
 * until when — the same fields in the same order on every card. Colour comes
 * from `severityLevel`, so a card always matches the header pill.
 */
function AlertCard({ alert }: { alert: PublicAlert }) {
  const level = severityLevel(alert.severity);
  const until = formatWarningTime(alert.expires);
  return (
    <li>
      <Link
        className="group grid grid-cols-[6px_minmax(0,1fr)] overflow-hidden rounded-gm-card border border-gm-border bg-background hover:border-gm-blue-ink focus-visible:border-gm-blue-ink"
        href={warningHref(alert.identifier)}
      >
        <span aria-hidden="true" className={WARNING_LEVEL_SWATCH[level]} />
        <span className="flex min-w-0 flex-col gap-2 p-4 lg:p-5">
          <span
            className={cn(
              "w-fit rounded px-2 py-0.5 font-bold text-label uppercase leading-label tracking-wider",
              WARNING_LEVEL_SURFACE[level]
            )}
          >
            {WARNING_LEVEL_LABEL[level]}
          </span>
          <span className="font-bold text-gm-heading text-heading-sm leading-heading-sm group-hover:underline">
            {alert.event}
          </span>
          <span className="text-body-base leading-body-base">
            {alert.headline}
          </span>
          <span className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body leading-body">
            <span className="font-semibold text-gm-text-secondary">Where</span>
            <span>
              {alert.areas.length > 0
                ? alert.areas.join(", ")
                : "Grenada, Carriacou and Petite Martinique"}
            </span>
            <span className="font-semibold text-gm-text-secondary">Until</span>
            <span>{until ?? "Until further notice"}</span>
          </span>
          <span className="flex items-center gap-1 font-semibold text-body text-gm-blue-ink leading-body">
            Full warning
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </span>
        </span>
      </Link>
    </li>
  );
}

function GroupCard({ group }: { group: HazardGroup }) {
  return (
    <section aria-label={group.name}>
      <h3 className="mb-2 font-bold text-gm-text-secondary text-label uppercase leading-label tracking-wider">
        {group.name}
      </h3>
      <ul className="flex flex-col gap-3">
        {group.alerts.map((alert) => (
          <AlertCard alert={alert} key={alert.identifier} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Renders live CAP groups. When the feed is unavailable the wording matches
 * the masthead ribbon deliberately: an unreachable feed must never be presented as
 * "no alerts in effect".
 */
export function AlertGroups({
  emptyLabel = "There are no alerts in effect for Grenada, Carriacou or Petite Martinique.",
  only,
  result,
}: {
  emptyLabel?: string;
  only?: readonly string[];
  result: AlertsResult;
}) {
  if (result.status === "unavailable") {
    return (
      <div className="rounded-gm-card border border-gm-risk-amber bg-gm-surface p-4 lg:p-5">
        <p className="text-body text-gm-text-secondary leading-body">
          Warning information cannot be retrieved right now. This does not mean
          there are no warnings in effect — check the Grenada Meteorological
          Service directly.
        </p>
      </div>
    );
  }

  const groups = only
    ? result.groups.filter((group) => only.includes(group.name))
    : result.groups;
  const total = groups.reduce((sum, group) => sum + group.alerts.length, 0);

  if (total === 0) {
    return (
      <div className="rounded-gm-card border border-gm-border bg-background p-4 lg:p-5">
        <p className="text-body text-gm-text-secondary leading-body">
          {emptyLabel}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {groups
        .filter((group) => group.alerts.length > 0)
        .map((group) => (
          <GroupCard group={group} key={group.name} />
        ))}
    </div>
  );
}
