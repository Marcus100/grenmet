"use client";

import { Accordion } from "@base-ui/react/accordion";
import { ChevronDownIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import {
  type AlertsResult,
  alertsLevel,
  alertsSummary,
  type CapSeverity,
  type PublicAlert,
} from "@/lib/cap";
import { cn } from "@/lib/utils";
import { WARNING_LEVEL_SURFACE } from "@/lib/warning-level";

interface CurrentAlertsAccordionProps {
  className?: string;
  result: AlertsResult;
}

/**
 * CAP severity colours. Deliberately the hazard scale rather than UI status
 * semantics: these must read the same in every theme.
 */
const SEVERITY_DOT: Record<CapSeverity, string> = {
  Extreme: "bg-gm-risk-red",
  Minor: "bg-gm-risk-green",
  Moderate: "bg-gm-risk-yellow",
  Severe: "bg-gm-risk-amber",
  Unknown: "bg-gm-risk-grey",
};

function formatExpiry(expires: string | null): string | null {
  if (!expires) {
    return null;
  }
  const date = new Date(expires);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString("en-GB", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

function AlertRow({ alert }: { alert: PublicAlert }) {
  const expiry = formatExpiry(alert.expires);
  return (
    <li className="border-gm-text-inverse/15 border-t py-3 first:border-t-0">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "mt-1.5 size-2.5 shrink-0 rounded-full",
            SEVERITY_DOT[alert.severity]
          )}
        />
        <div className="min-w-0">
          <p className="font-semibold text-gm-text-inverse">
            <span className="mr-2 text-caption uppercase opacity-75">
              {alert.severity}
            </span>
            {alert.headline}
          </p>
          {alert.areas.length > 0 && (
            <p className="text-caption text-gm-text-inverse/75">
              {alert.areas.join(", ")}
            </p>
          )}
          {expiry && (
            <p className="text-caption text-gm-text-inverse/75">
              Until {expiry}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export function CurrentAlertsAccordion({
  className,
  result,
}: CurrentAlertsAccordionProps) {
  const unavailable = result.status === "unavailable";
  const groups = result.status === "ok" ? result.groups : [];
  const level = alertsLevel(result);
  // The status line is the title: it names the level and the count, so the
  // colour is never the only signal.
  const summary = alertsSummary(result);

  return (
    <Accordion.Root className={cn("mb-4 flex flex-col", className)}>
      <Accordion.Item value="alerts">
        <Accordion.Header className="flex">
          <Accordion.Trigger
            className={cn(
              "group flex min-h-11 w-full shrink-0 items-center justify-between gap-3 rounded-tl-md rounded-tr-md border-2 border-gm-navy px-4 py-2 sm:px-5 md:px-6 md:py-3",
              WARNING_LEVEL_SURFACE[level]
            )}
          >
            <span className="flex items-center gap-2.5 text-left font-bold text-body-base leading-body-base">
              <TriangleAlertIcon
                aria-hidden="true"
                className="size-5 shrink-0"
              />
              {summary}
            </span>
            <span className="flex items-center gap-3">
              <ChevronDownIcon
                aria-hidden="true"
                className="size-6 shrink-0 transition-transform duration-200 group-data-panel-open:rotate-180"
              />
            </span>
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel
          className="overflow-hidden transition-[height] duration-200 ease-out"
          style={
            {
              height: "var(--accordion-panel-height, 0)",
            } as React.CSSProperties
          }
        >
          <div className="w-full rounded-br-md rounded-bl-md border border-gm-navy bg-gm-navy px-6 pt-5 pb-6 md:px-8 md:pt-6 md:pb-7">
            {unavailable ? (
              <p className="text-body-base text-gm-text-inverse leading-body-base">
                Warning information cannot be retrieved right now. This does not
                mean there are no warnings in effect — check the Grenada
                Meteorological Service directly.
              </p>
            ) : (
              <Accordion.Root className="flex flex-col">
                {groups.map((group) => {
                  const count = group.alerts.length;
                  return (
                    <Accordion.Item key={group.name} value={group.name}>
                      <Accordion.Header className="flex items-center gap-3">
                        <Link
                          className="flex min-h-10 flex-1 items-center gap-4 text-gm-text-inverse hover:underline"
                          href="/warnings"
                        >
                          <span className="w-9 shrink-0 font-semibold">
                            {count}
                          </span>
                          <span>{group.name}</span>
                        </Link>
                        {count > 0 ? (
                          <Accordion.Trigger
                            aria-label={`Show CAP alerts: ${group.name}`}
                            className="p-2 text-gm-text-inverse"
                          >
                            <ChevronDownIcon className="size-5" />
                          </Accordion.Trigger>
                        ) : null}
                      </Accordion.Header>
                      <Accordion.Panel
                        className="overflow-hidden transition-[height] duration-200 ease-out"
                        style={
                          {
                            height: "var(--accordion-panel-height, 0)",
                          } as React.CSSProperties
                        }
                      >
                        <ul className="pt-1 pb-3 pl-13">
                          {group.alerts.map((alert) => (
                            <AlertRow alert={alert} key={alert.identifier} />
                          ))}
                        </ul>
                      </Accordion.Panel>
                    </Accordion.Item>
                  );
                })}
              </Accordion.Root>
            )}
          </div>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  );
}
