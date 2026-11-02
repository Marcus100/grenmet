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
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
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
    <div className="space-y-2">
      {crumbs.length > 0 ? (
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb) => (
              <BreadcrumbItem key={crumb.href}>
                <BreadcrumbLink render={<Link href={crumb.href as Route} />}>
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
      <PageHeader actions={actions} description={children} title={title} />
    </div>
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
              className="text-destructive mt-0.5 size-4 shrink-0"
            />
          ) : (
            <AlertTriangle
              aria-hidden="true"
              className="text-warning-soft-foreground mt-0.5 size-4 shrink-0"
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
