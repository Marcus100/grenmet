"use client";

import type { CapAlertPublic, CapLifecycleState } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import type { Route } from "next";
import Link from "next/link";
import { useId, useState } from "react";
import { AlertBadges, grenadaTime } from "@/components/desk/desk-panels";
import {
  ALL_STATES,
  type BoardFilter,
  type BoardSection,
  visibleSections,
} from "@/lib/desk/board-filter";

const CHIP_LABEL: Record<CapLifecycleState, string> = {
  APPROVED: "Approved, not yet published",
  CANCELLED: "Cancelled",
  DRAFT: "Drafts",
  EXPIRED: "Expired",
  PUBLISHED: "In force",
  SUBMITTED: "Awaiting approval",
};

const CHIP_STATES: readonly CapLifecycleState[] = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "PUBLISHED",
];

function AlertRow({ alert }: { alert: CapAlertPublic }) {
  const info = alert.info?.[0];
  return (
    <li className="flex flex-col gap-1 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link
          className="font-medium text-info hover:underline"
          href={`/desk/alerts/${alert.id}` as Route}
        >
          {info?.headline ?? alert.identifier}
        </Link>
        <p className="text-caption text-muted-foreground">
          {info?.event ?? "No event"} · Severity {info?.severity ?? "Unknown"} ·
          Expires {grenadaTime(info?.expires)}
        </p>
      </div>
      <AlertBadges alert={alert} />
    </li>
  );
}

/**
 * The board's sections with a state filter and a text search. Both work on
 * the alerts already loaded on the server; nothing is fetched again. Chips
 * show how many alerts each stage holds, so an empty chip is visibly empty.
 */
export function AlertBoardFilter({
  sections,
}: {
  sections: readonly BoardSection[];
}) {
  const [filter, setFilter] = useState<BoardFilter>(ALL_STATES);
  const [query, setQuery] = useState("");
  const searchId = useId();
  const shown = visibleSections(sections, filter, query);
  const filterLabel = filter === ALL_STATES ? null : CHIP_LABEL[filter];

  return (
    <div className="space-y-4">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Filter by stage</legend>
        <Button
          aria-pressed={filter === ALL_STATES}
          onClick={() => setFilter(ALL_STATES)}
          size="sm"
          type="button"
          variant={filter === ALL_STATES ? "default" : "outline"}
        >
          All
        </Button>
        {CHIP_STATES.map((state) => {
          const count = countIn(sections, state) ?? 0;
          return (
            <Button
              aria-pressed={filter === state}
              key={state}
              onClick={() => setFilter(filter === state ? ALL_STATES : state)}
              size="sm"
              type="button"
              variant={filter === state ? "default" : "outline"}
            >
              {CHIP_LABEL[state]} ({count})
            </Button>
          );
        })}
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor={searchId}>Search headline or identifier</Label>
        <Input
          id={searchId}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="For example: rain, or gms-rain"
          type="search"
          value={query}
        />
      </div>
      {filterLabel ? (
        <p className="text-body-sm text-muted-foreground" role="status">
          Showing {filterLabel} only.{" "}
          <button
            className="text-info underline"
            onClick={() => setFilter(ALL_STATES)}
            type="button"
          >
            Show every stage
          </button>
        </p>
      ) : null}
      {shown.map((section) => (
        <section className="rounded-lg border bg-card p-4" key={section.state}>
          <h2 className="font-semibold text-lg">
            {section.title}{" "}
            <span className="font-normal text-muted-foreground">
              ({section.alerts.length})
            </span>
          </h2>
          {section.alerts.length === 0 ? (
            <p className="py-2 text-body-sm text-muted-foreground">
              {(countIn(sections, section.state) ?? 0) > 0
                ? "No alerts in this stage match the search."
                : section.empty}
            </p>
          ) : (
            <ul>
              {section.alerts.map((alert) => (
                <AlertRow alert={alert} key={alert.id} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

/** How many alerts a stage holds before any search, or null if it is absent. */
function countIn(
  sections: readonly BoardSection[],
  state: CapLifecycleState
): number | null {
  return sections.find((item) => item.state === state)?.alerts.length ?? null;
}
