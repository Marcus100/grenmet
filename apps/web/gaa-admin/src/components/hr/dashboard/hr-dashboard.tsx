"use client";
import type { HrDashboardPublic } from "@barrelsgd/api-client";
import { useSessionUser } from "@barrelsgd/auth";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@barrelsgd/ui/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@barrelsgd/ui/components/ui/dropdown-menu";
import { cn } from "@barrelsgd/ui/lib/utils";
import { format, parseISO } from "date-fns";
import { ChevronDown, Plus } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import {
  dashboardData,
  type MyRequest,
  type NewRequestItem,
  newRequestItems,
  type PersonIn,
  type PersonOut,
  type RequestState,
} from "./dashboard-data";

const requestState: Record<
  RequestState,
  {
    label: string;
    variant:
      | "light-warning"
      | "light-info"
      | "light-success"
      | "light-error"
      | "solid-warning";
  }
> = {
  pending: { label: "Pending", variant: "light-warning" },
  review: { label: "In review", variant: "light-info" },
  approved: { label: "Approved", variant: "light-success" },
  draft: { label: "Draft", variant: "light-info" },
  returned: { label: "Returned", variant: "solid-warning" },
  rejected: { label: "Rejected", variant: "light-error" },
  cancelled: { label: "Cancelled", variant: "light-info" },
};

const PROGRESS_STEPS = [0, 1, 2] as const;

function firstNameOf(fullName: string | null | undefined): string | undefined {
  return fullName?.split(" ")[0];
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Initials({ name }: { name: string }) {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary text-xs">
      {initialsOf(name)}
    </div>
  );
}

function SectionCard({
  action,
  children,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  title: React.ReactNode;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b py-3.5">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

function GlanceCard({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="py-0">
        <CardTitle className="font-medium text-muted-foreground text-sm">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">{children}</CardContent>
    </Card>
  );
}

function GlanceLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      className="font-medium text-primary text-sm hover:underline"
      href={href as Route}
    >
      {children}
    </Link>
  );
}

function AtAGlance({ data }: { data: HrDashboardPublic }) {
  const balance = data.vacation_balance;
  const hasBalance = balance !== null && balance !== undefined;
  return (
    <section
      aria-label="At a glance"
      className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
    >
      <GlanceCard title="Vacation leave">
        <p className="flex items-baseline gap-1.5">
          <span className="font-semibold text-4xl tabular-nums tracking-tight">
            {hasBalance ? balance : "Not recorded"}
          </span>
          {hasBalance ? (
            <span className="text-muted-foreground">days left</span>
          ) : null}
        </p>
        <p className="text-muted-foreground text-sm">
          {data.open_requests === 1
            ? "1 open request"
            : `${data.open_requests} open requests`}
        </p>
      </GlanceCard>
      <GlanceCard title="Your next shift">
        <p className="font-semibold text-xl">
          {data.next_shift ?? "Not scheduled"}
        </p>
        <GlanceLink href="/roster">View roster</GlanceLink>
      </GlanceCard>
      <GlanceCard title="Timesheet">
        <p className="font-semibold text-xl">Pay period hours</p>
        <GlanceLink href="/hr/timesheet">Review hours</GlanceLink>
      </GlanceCard>
    </section>
  );
}

function Progress({ step }: { step: MyRequest["step"] }) {
  if (step === 0) {
    return null;
  }
  return (
    <ol aria-label={`Step ${step} of 3`} className="m-0 flex gap-1 p-0">
      {PROGRESS_STEPS.map((index) => (
        <li
          className={cn(
            "h-1 w-7 list-none rounded-full",
            index < step ? "bg-primary" : "bg-muted"
          )}
          key={index}
        />
      ))}
    </ol>
  );
}

function MyRequestsList({ requests }: { requests: MyRequest[] }) {
  if (requests.length === 0) {
    return (
      <p className="p-4 text-muted-foreground text-sm">
        You have no requests yet.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {requests.map((request) => {
        const state = requestState[request.state];
        return (
          <li
            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4"
            key={request.id}
          >
            <div className="min-w-48 flex-1">
              <div className="truncate font-medium text-sm">
                {request.title}
              </div>
              <div className="truncate text-muted-foreground text-xs">
                {request.meta}
              </div>
            </div>
            <Progress step={request.step} />
            <Badge variant={state.variant}>{state.label}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

function TeamToday({
  onDuty,
  away,
}: {
  onDuty: PersonIn[];
  away: PersonOut[];
}) {
  const [side, setSide] = useState<"in" | "out">("in");
  const rows =
    side === "in"
      ? onDuty.map((p) => ({ id: p.id, name: p.name, note: p.shift }))
      : away.map((p) => ({ id: p.id, name: p.name, note: p.note }));
  return (
    <SectionCard
      action={
        <span className="text-muted-foreground text-sm">
          {onDuty.length} on duty
        </span>
      }
      title="Team today"
    >
      <fieldset
        aria-label="Show who is on duty or away"
        className="m-0 flex gap-1 border-b px-5 py-2.5"
      >
        {(
          [
            ["in", "On duty"],
            ["out", "Away"],
          ] as const
        ).map(([id, label]) => (
          <button
            aria-pressed={side === id}
            className={cn(
              "rounded-full px-3 py-1 font-medium text-xs transition-colors",
              side === id
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={id}
            onClick={() => setSide(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </fieldset>
      {rows.length === 0 ? (
        <p className="p-4 text-muted-foreground text-sm">
          {side === "in"
            ? "No published work shifts for today."
            : "No published time away for today."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3 p-5">
          {rows.map((row) => (
            <li className="flex items-center gap-2.5" key={row.id}>
              <Initials name={row.name} />
              <span className="flex-1 truncate text-sm">{row.name}</span>
              <span className="text-muted-foreground text-xs">{row.note}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function ApprovalsCallout({ count }: { count: number }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-primary-soft p-5">
      <h2 className="font-semibold text-base">
        {count === 0
          ? "Nothing needs your approval"
          : `${count} ${count === 1 ? "request needs" : "requests need"} your approval`}
      </h2>
      <Link
        className="font-semibold text-primary text-sm hover:underline"
        href="/hr/approvals"
      >
        Open approvals →
      </Link>
    </section>
  );
}

function OtherFormsItem({ item }: { item: NewRequestItem }) {
  const Icon = item.icon;
  return (
    <DropdownMenuItem
      className="items-start gap-3 px-2 py-2"
      render={<Link href={item.href as Route} />}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-medium text-sm leading-none">{item.title}</span>
        <span className="text-muted-foreground text-xs">
          {item.description}
        </span>
      </span>
    </DropdownMenuItem>
  );
}

/** Secondary launcher — leave is the one primary action on Home. */
function OtherFormsMenu() {
  const requests = newRequestItems.filter(
    (item) => item.group === "request" && item.id !== "leave"
  );
  const records = newRequestItems.filter((item) => item.group === "record");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
      >
        Other forms
        <ChevronDown className="opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-muted-foreground text-xs">
            Requests
          </DropdownMenuLabel>
          {requests.map((item) => (
            <OtherFormsItem item={item} key={item.id} />
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-muted-foreground text-xs">
            Records
          </DropdownMenuLabel>
          {records.map((item) => (
            <OtherFormsItem item={item} key={item.id} />
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function HrDashboard({ data }: { data: HrDashboardPublic }) {
  const { myRequests, onDutyToday, whosOut, pendingCount } =
    dashboardData(data);
  const user = useSessionUser();
  const firstName = firstNameOf(user.full_name);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">
            {format(parseISO(data.date), "EEEE, d MMMM")}
          </p>
          <h1 className="mt-1 font-semibold text-2xl tracking-tight">
            {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OtherFormsMenu />
          <Link className={cn(buttonVariants({ size: "lg" }))} href="/hr/leave">
            <Plus />
            Request leave
          </Link>
        </div>
      </div>

      <AtAGlance data={data} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_336px]">
        <SectionCard title="Your requests">
          <MyRequestsList requests={myRequests} />
        </SectionCard>

        <aside className="flex flex-col gap-4">
          <TeamToday away={whosOut} onDuty={onDutyToday} />
          {data.can_approve ? <ApprovalsCallout count={pendingCount} /> : null}
        </aside>
      </div>
    </div>
  );
}
