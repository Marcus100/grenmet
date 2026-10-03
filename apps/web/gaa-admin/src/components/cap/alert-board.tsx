"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  BadgeCheck,
  Clock3,
  FilePlus,
  FileText,
  Search,
  Settings,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { CapAlertList } from "@/lib/cap-api";
import { formatDateTime, primaryInfo } from "@/lib/cap-api";
import { SEVERITY_RISK_VAR } from "@/lib/cap-severity";
import { SeverityBadge } from "./severity-badge";

const FILTERS = ["DRAFT", "SUBMITTED", "APPROVED", "PUBLISHED"] as const;
type Filter = (typeof FILTERS)[number] | "ALL";

const STAT_ICON: Record<
  (typeof FILTERS)[number],
  React.ComponentType<{ className?: string }>
> = {
  DRAFT: FileText,
  SUBMITTED: Clock3,
  APPROVED: BadgeCheck,
  PUBLISHED: BadgeCheck,
};

/**
 * Client half of the Alert Dashboard — the fetch stays server-side
 * (EditorSection); this owns the interactive bits: state filter chips,
 * search, and the severity-striped row list. Workflow state (draft →
 * published) is coloured with sky/blue/lime, deliberately not the
 * red/amber/green risk scale used for severity, so a routine draft never
 * reads as a hazard.
 */
export function AlertBoard({ alerts }: { alerts: CapAlertList }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const result: Record<(typeof FILTERS)[number], number> = {
      DRAFT: 0,
      SUBMITTED: 0,
      APPROVED: 0,
      PUBLISHED: 0,
    };
    for (const alert of alerts.data) {
      if (alert.lifecycle_state in result) {
        result[alert.lifecycle_state as (typeof FILTERS)[number]] += 1;
      }
    }
    return result;
  }, [alerts.data]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return alerts.data.filter((alert) => {
      if (filter !== "ALL" && alert.lifecycle_state !== filter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      const info = primaryInfo(alert);
      return (
        info?.headline?.toLowerCase().includes(needle) ||
        alert.identifier.toLowerCase().includes(needle)
      );
    });
  }, [alerts.data, filter, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-gm-text-primary text-heading-md leading-heading-md">
          Alert Dashboard
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/cap/admin/new">
              <FilePlus aria-hidden="true" />
              New
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/cap/profiles">
              <Settings aria-hidden="true" />
              Hazard profiles
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FILTERS.map((state) => {
          const Icon = STAT_ICON[state];
          return (
            <button
              className="border border-gm-border bg-card p-4 text-left shadow-card"
              key={state}
              onClick={() => setFilter(filter === state ? "ALL" : state)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-gm-text-muted text-label uppercase leading-label">
                  {state}
                </span>
                <span
                  className="flex size-5 items-center justify-center rounded-md"
                  style={{
                    background: `${stateAccent(state)}22`,
                    color: stateAccent(state),
                  }}
                >
                  <Icon className="size-3.5" />
                </span>
              </div>
              <div className="mt-2 text-gm-text-primary text-heading-md leading-heading-md">
                {counts[state]}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-56 items-center gap-2 border border-gm-border bg-card px-3 py-1.5">
          <Search aria-hidden="true" className="size-3.5 text-gm-text-muted" />
          <input
            className="w-full bg-transparent text-body-sm outline-none placeholder:text-gm-text-muted"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search headline or identifier…"
            value={query}
          />
        </div>
        <button
          className="border px-3 py-1.5 font-semibold text-body-sm leading-body-sm"
          onClick={() => setFilter("ALL")}
          style={{
            borderColor:
              filter === "ALL" ? "var(--gm-navy)" : "var(--gm-border)",
            background:
              filter === "ALL" ? "var(--gm-navy)" : "var(--gm-surface-page)",
            color: filter === "ALL" ? "#fff" : "var(--gm-text-secondary)",
          }}
          type="button"
        >
          All <span className="font-mono opacity-75">{alerts.data.length}</span>
        </button>
      </div>

      <div className="overflow-hidden border border-gm-border bg-card shadow-card">
        <div className="grid grid-cols-[1fr_120px_120px] gap-3 border-gm-border border-b bg-gm-surface px-4 py-3 text-gm-text-muted text-label uppercase leading-label">
          <span>Alert</span>
          <span>State</span>
          <span>Sent</span>
        </div>
        {visible.length === 0 ? (
          <div className="px-4 py-8 text-center text-body text-gm-text-muted leading-body">
            No CAP alerts match this view.
          </div>
        ) : (
          visible.map((alert, index) => {
            const info = primaryInfo(alert);
            return (
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                className="flex border-gm-border border-b last:border-b-0"
                initial={{ opacity: 0, x: -6 }}
                key={alert.id}
                transition={{
                  duration: 0.15,
                  delay: Math.min(index, 8) * 0.02,
                }}
              >
                <span
                  className="w-1 flex-shrink-0"
                  style={{
                    background: SEVERITY_RISK_VAR[info?.severity ?? "Unknown"],
                  }}
                />
                <div className="grid flex-1 grid-cols-[1fr_120px_120px] items-center gap-3 px-4 py-3 text-body leading-body">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={info?.severity} />
                      <Link
                        className="min-w-0 truncate text-gm-text-primary underline"
                        href={`/cap/admin/${alert.id}`}
                      >
                        {info?.headline ?? alert.identifier}
                      </Link>
                    </div>
                    <span className="font-mono text-gm-text-muted text-micro leading-micro">
                      {alert.identifier}
                    </span>
                  </div>
                  <span className="text-gm-text-secondary">
                    {alert.lifecycle_state}
                  </span>
                  <span className="text-gm-text-secondary">
                    {formatDateTime(alert.sent)}
                  </span>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

function stateAccent(state: (typeof FILTERS)[number]): string {
  switch (state) {
    case "DRAFT":
      return "var(--gm-text-muted)";
    case "SUBMITTED":
      return "var(--gm-sky-ink)";
    case "APPROVED":
      return "var(--gm-blue-ink)";
    case "PUBLISHED":
      return "var(--gm-lime-ink)";
    default:
      return "var(--gm-text-muted)";
  }
}
