"use client";

import { useSessionUser } from "@grenmet/auth";
import { Badge } from "@grenmet/ui/components/ui/badge";
import { Button, buttonVariants } from "@grenmet/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@grenmet/ui/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@grenmet/ui/components/ui/dropdown-menu";
import { cn } from "@grenmet/ui/lib/utils";
import {
  ChevronDown,
  FileBarChart,
  type LucideIcon,
  Plus,
  ShieldCheck,
  User,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  type Activity,
  type Approval,
  adminModules,
  adminStats,
  type Module,
  type MyRequest,
  myRequests,
  type NewRequestItem,
  newRequestItems,
  type OrgStat,
  onDutyToday,
  orgStats,
  type PersonIn,
  type PersonOut,
  pendingApprovals,
  presenceToday,
  type RequestState,
  recentActivity,
  type Stat,
  staffStats,
  type Trend,
  whosOut,
} from "./dashboard-data";

const trendClass: Record<Trend, string> = {
  up: "text-gm-warning-green-fg",
  down: "text-destructive",
  flat: "text-muted-foreground",
};

const statusVariant: Record<
  PersonOut["status"],
  { label: string; variant: "light-info" | "light-warning" | "light-success" }
> = {
  leave: { label: "Annual leave", variant: "light-info" },
  sick: { label: "Sick", variant: "light-warning" },
  field: { label: "Field duty", variant: "light-success" },
};

const requestState: Record<
  RequestState,
  { label: string; variant: "light-warning" | "light-info" | "light-success" }
> = {
  pending: { label: "Pending", variant: "light-warning" },
  review: { label: "In review", variant: "light-info" },
  approved: { label: "Approved", variant: "light-success" },
};

type DashboardView = "staff" | "admin";

function headingFor(isAdmin: boolean, firstName: string | undefined): string {
  if (isAdmin) {
    return "HR overview";
  }
  if (firstName) {
    return `Welcome back, ${firstName}`;
  }
  return "Welcome back";
}

interface SegmentOption {
  icon?: LucideIcon;
  id: string;
  label: string;
}

/** Reusable segmented switcher (Staff/Admin view, On-duty/Away list, …). */
function SegmentToggle({
  ariaLabel,
  onChange,
  options,
  size = "default",
  value,
}: {
  ariaLabel: string;
  onChange: (id: string) => void;
  options: SegmentOption[];
  size?: "sm" | "default";
  value: string;
}) {
  return (
    <fieldset
      aria-label={ariaLabel}
      className="m-0 inline-flex items-center rounded-full border bg-muted p-0.5"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.id;
        return (
          <button
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full font-medium transition-colors",
              size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={option.id}
            onClick={() => onChange(option.id)}
            type="button"
          >
            {Icon ? (
              <Icon className={size === "sm" ? "size-3" : "size-3.5"} />
            ) : null}
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
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

function Initials({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary text-xs",
        className
      )}
    >
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
        <CardTitle className="text-sm">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

/** Compact, hairline-divided stat grid — the cells share 1px `bg-border` gutters. */
function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-border">
      <div className="grid grid-cols-2 gap-px xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div className="bg-card p-4" key={stat.id}>
              <div className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
                <Icon className="size-3.5" />
                {stat.label}
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-2 font-medium text-xl tabular-nums tracking-tight">
                <span>
                  {stat.value}
                  {stat.valueSuffix ? (
                    <span className="ml-1 font-normal text-muted-foreground text-sm">
                      {stat.valueSuffix}
                    </span>
                  ) : null}
                </span>
                {stat.delta ? (
                  <span
                    className={cn(
                      "font-semibold text-xs tabular-nums",
                      trendClass[stat.trend ?? "flat"]
                    )}
                  >
                    {stat.delta}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-muted-foreground text-xs">
                {stat.foot}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModuleGrid({ modules }: { modules: Module[] }) {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {modules.map((mod) => {
        const Icon = mod.icon;
        return (
          <Link
            className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={mod.href}
            key={mod.id}
          >
            <Card className="h-full gap-0 py-4 transition-colors group-hover:border-primary/40">
              <CardContent className="px-4">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <div className="mt-2.5 flex items-center gap-2 font-medium text-sm">
                  {mod.title}
                  {mod.count ? (
                    <Badge variant={mod.countHot ? "light-error" : "secondary"}>
                      {mod.count}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {mod.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function WhosOutList({ people }: { people: PersonOut[] }) {
  return (
    <ul className="divide-y divide-border">
      {people.map((person) => {
        const status = statusVariant[person.status];
        return (
          <li className="flex items-center gap-3 px-4 py-3" key={person.id}>
            <Initials name={person.name} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-sm">{person.name}</div>
              <div className="truncate text-muted-foreground text-xs">
                {person.department} · {person.note}
              </div>
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

function OnDutyList({ people }: { people: PersonIn[] }) {
  return (
    <ul className="divide-y divide-border">
      {people.map((person) => (
        <li className="flex items-center gap-3 px-4 py-3" key={person.id}>
          <Initials name={person.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-sm">{person.name}</div>
            <div className="truncate text-muted-foreground text-xs">
              {person.department} · {person.shift}
            </div>
          </div>
          <Badge
            variant={person.status === "on-now" ? "light-success" : "secondary"}
          >
            {person.status === "on-now" ? "On now" : "Later"}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** Attendance at a glance — headline in/away split, with a per-list toggle. */
function PresenceCard() {
  const [side, setSide] = useState<"in" | "out">("in");
  const total = presenceToday.in + presenceToday.out;
  const inPct = Math.round((presenceToday.in / total) * 100);

  return (
    <SectionCard
      action={
        <Link
          className="font-medium text-primary text-sm hover:underline"
          href="/roster"
        >
          Open roster
        </Link>
      }
      title="Attendance today"
    >
      <div className="flex flex-col gap-2.5 border-b px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span>
            <span className="font-medium tabular-nums">{presenceToday.in}</span>
            <span className="text-muted-foreground"> on duty</span>
          </span>
          <span>
            <span className="font-medium tabular-nums">
              {presenceToday.out}
            </span>
            <span className="text-muted-foreground"> away</span>
          </span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="bg-primary" style={{ width: `${inPct}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="font-medium text-muted-foreground text-xs">
          {side === "in" ? "On duty" : "Away today"}
        </span>
        <SegmentToggle
          ariaLabel="Show who is on duty or away"
          onChange={(id) => setSide(id as "in" | "out")}
          options={[
            { id: "in", label: "On duty" },
            { id: "out", label: "Away" },
          ]}
          size="sm"
          value={side}
        />
      </div>
      {side === "in" ? (
        <OnDutyList people={onDutyToday} />
      ) : (
        <WhosOutList people={whosOut} />
      )}
    </SectionCard>
  );
}

function ActivityList({ items }: { items: Activity[] }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li className="flex items-center gap-3 px-4 py-3" key={item.id}>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-sm">{item.title}</div>
              <div className="truncate text-muted-foreground text-xs">
                {item.detail}
              </div>
            </div>
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {item.when}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ApprovalsPreview({ approvals }: { approvals: Approval[] }) {
  return (
    <ul className="divide-y divide-border">
      {approvals.map((approval) => (
        <li className="px-3 py-3" key={approval.id}>
          <div className="flex items-center gap-2.5">
            <Initials className="size-8" name={approval.name} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-sm">
                {approval.name}
              </div>
              <div className="truncate text-muted-foreground text-xs">
                {approval.kind}
              </div>
            </div>
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {approval.when}
            </span>
          </div>
          <div className="mt-2.5 flex gap-2">
            <Button className="flex-1" size="sm" type="button">
              Approve
            </Button>
            <Button
              className="flex-1"
              size="sm"
              type="button"
              variant="outline"
            >
              Decline
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function MyRequestsList({ requests }: { requests: MyRequest[] }) {
  return (
    <ul className="divide-y divide-border">
      {requests.map((request) => {
        const state = requestState[request.state];
        return (
          <li className="flex items-center gap-3 px-4 py-3" key={request.id}>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-sm">
                {request.title}
              </div>
              <div className="truncate text-muted-foreground text-xs">
                {request.meta}
              </div>
            </div>
            <Badge variant={state.variant}>{state.label}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

function OrgSnapshot({ stats }: { stats: OrgStat[] }) {
  return (
    <ul className="divide-y divide-border">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <li
            className="flex items-center justify-between px-4 py-3"
            key={stat.id}
          >
            <span className="flex items-center gap-2.5 text-muted-foreground text-sm">
              <Icon className="size-4" />
              {stat.label}
            </span>
            <span className="font-medium text-sm tabular-nums">
              {stat.value}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function NewRequestItemRow({ item }: { item: NewRequestItem }) {
  const Icon = item.icon;
  return (
    <DropdownMenuItem
      className="items-start gap-3 px-2 py-2"
      render={<Link href={item.href} />}
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

/** "New request" launcher — the forms/records live here, not on the dashboard. */
function NewRequestMenu() {
  const requests = newRequestItems.filter((item) => item.group === "request");
  const records = newRequestItems.filter((item) => item.group === "record");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="lg" />}>
        <Plus />
        New request
        <ChevronDown className="opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-muted-foreground text-xs">
            Requests
          </DropdownMenuLabel>
          {requests.map((item) => (
            <NewRequestItemRow item={item} key={item.id} />
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-muted-foreground text-xs">
            Records
          </DropdownMenuLabel>
          {records.map((item) => (
            <NewRequestItemRow item={item} key={item.id} />
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function HrDashboard() {
  const user = useSessionUser();
  const [view, setView] = useState<DashboardView>("staff");
  const isAdminView = view === "admin";
  const firstName = user.full_name?.split(" ")[0];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            Human Resources
          </p>
          <h1 className="mt-1 font-semibold text-2xl tracking-tight">
            {headingFor(isAdminView, firstName)}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isAdminView
              ? "Approvals, roster coverage and people across GMS."
              : "Your requests, roster and HR forms — all in one place."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentToggle
            ariaLabel="Switch view"
            onChange={(id) => setView(id as DashboardView)}
            options={[
              { id: "staff", label: "Staff", icon: User },
              { id: "admin", label: "Admin", icon: ShieldCheck },
            ]}
            value={view}
          />
          {isAdminView ? (
            <Link
              className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
              href="/coming-soon"
            >
              <FileBarChart />
              Reports
            </Link>
          ) : null}
          <NewRequestMenu />
        </div>
      </div>

      {/* Stat strip — org metrics in the admin view, personal in the staff view */}
      <StatGrid stats={isAdminView ? adminStats : staffStats} />

      {/* Main + rail */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="flex flex-col gap-6">
          {isAdminView ? (
            <SectionCard
              action={
                <Link
                  className="font-medium text-primary text-sm hover:underline"
                  href="/hr-setup"
                >
                  Settings
                </Link>
              }
              title="Manage"
            >
              <ModuleGrid modules={adminModules} />
            </SectionCard>
          ) : null}

          <PresenceCard />

          <SectionCard title="Recent activity">
            <ActivityList items={recentActivity} />
          </SectionCard>
        </div>

        <aside className="flex flex-col gap-6">
          {isAdminView ? (
            <SectionCard
              action={
                <Link
                  className="font-medium text-primary text-sm hover:underline"
                  href="/hr/approvals"
                >
                  All (7)
                </Link>
              }
              title="Approvals inbox"
            >
              <ApprovalsPreview approvals={pendingApprovals} />
            </SectionCard>
          ) : (
            <SectionCard title="My requests">
              <MyRequestsList requests={myRequests} />
            </SectionCard>
          )}

          <SectionCard title="Organisation">
            <OrgSnapshot stats={orgStats} />
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
