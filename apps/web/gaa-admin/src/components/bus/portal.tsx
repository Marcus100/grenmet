import type {
  TimetableIssue,
  TimetableVersionState,
  TransportTripStatus,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@barrelsgd/ui/components/ui/breadcrumb";
import { AlertTriangle, CircleX } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { VERSION_STATE_LABELS } from "@/lib/transport/timetable";

export function BusHeader({
  actions,
  children,
  crumbs = [],
  title,
}: {
  actions?: ReactNode;
  children?: ReactNode;
  crumbs?: { href: string; label: string }[];
  title: string;
}) {
  return (
    <header className="space-y-2">
      {crumbs.length > 0 ? (
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb) => (
              <BreadcrumbItem key={crumb.href}>
                <BreadcrumbLink render={<Link href={crumb.href} />}>
                  {crumb.label}
                </BreadcrumbLink>
                <BreadcrumbSeparator />
              </BreadcrumbItem>
            ))}
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
          {children ? (
            <p className="text-muted-foreground text-sm">{children}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

const STATE_VARIANT = {
  draft: "light-info",
  scheduled: "light-primary",
  current: "light-success",
  superseded: "light-light",
  discarded: "light-light",
} as const satisfies Record<TimetableVersionState, string>;

export function VersionStateBadge({ state }: { state: TimetableVersionState }) {
  return (
    <Badge variant={STATE_VARIANT[state]}>{VERSION_STATE_LABELS[state]}</Badge>
  );
}

export function TripStatusBadge({ status }: { status: TransportTripStatus }) {
  if (status !== "awaiting_confirmation") return null;
  return <Badge variant="light-warning">Awaiting confirmation</Badge>;
}

export function IssueList({ issues }: { issues: TimetableIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm">
      {issues.map((issue) => (
        <li
          className="flex items-start gap-2"
          key={`${issue.code}-${issue.tripId ?? ""}-${issue.routeId ?? ""}`}
        >
          {issue.severity === "error" ? (
            <CircleX
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-destructive"
            />
          ) : (
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-warning-soft-foreground"
            />
          )}
          <span>
            <span className="sr-only">
              {issue.severity === "error" ? "Blocking: " : "Warning: "}
            </span>
            {issue.message}
          </span>
        </li>
      ))}
    </ul>
  );
}
