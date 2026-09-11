import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@barrelsgd/ui/components/ui/card";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@barrelsgd/ui/components/ui/progress";
import { Separator } from "@barrelsgd/ui/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CalendarPlus2,
  Check,
  ChevronDown,
  CircleCheckBig,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  MoreHorizontal,
  ReceiptText,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  Ticket,
  TrendingUp,
  TriangleAlert,
  Users,
  WifiOff,
} from "lucide-react";
import type { ComponentType } from "react";
import { formatMoney } from "@/domain/money";
import type {
  ChannelSales,
  EventDashboard,
  EventRecord,
  EventStatus,
  NextAction,
  ReadinessCheck,
  ReconciliationState,
  SalesTotals,
  SettlementPreview,
} from "@/domain/types";
import { formatEventDate } from "@/lib/datetime";

type Icon = ComponentType<{ className?: string }>;

interface NavigationItem {
  active?: boolean;
  badge?: string;
  icon: Icon;
  label: string;
}

const navigation: NavigationItem[] = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Build event", icon: CalendarPlus2 },
  { label: "Tickets & capacity", icon: Ticket },
  { label: "Orders", icon: ReceiptText },
  { label: "Attendees", icon: Users },
  { label: "Door & box office", icon: ScanLine, badge: "2" },
  { label: "Finance", icon: Landmark },
  { label: "Team", icon: ShieldCheck },
  { label: "Settings", icon: Settings2 },
];

const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft",
  "on-sale": "On sale",
  closed: "Closed",
};

const RECONCILIATION_LABELS: Record<ReconciliationState, string> = {
  reconciled: "Reconciled",
  "needs-count": "Needs count",
  recorded: "Recorded",
};

const READINESS_ICONS: Record<string, Icon> = {
  inventory: Check,
  "guest-journey": Check,
  door: WifiOff,
  settlement: Landmark,
};

interface Metric {
  detail: string;
  icon: Icon;
  label: string;
  value: string;
}

function buildMetrics(
  event: EventRecord,
  totals: SalesTotals,
  settlement: SettlementPreview,
  salesTrendLabel: string
): Metric[] {
  const ticketsPerOrder =
    totals.orders === 0 ? "0.0" : (totals.tickets / totals.orders).toFixed(1);

  return [
    {
      label: "Gross sales",
      value: formatMoney(totals.gross, { decimals: false }),
      detail: salesTrendLabel,
      icon: CircleDollarSign,
    },
    {
      label: "Tickets issued",
      value: totals.tickets.toLocaleString("en-US"),
      detail: `of ${event.capacity.toLocaleString("en-US")} capacity`,
      icon: Ticket,
    },
    {
      label: "Orders recorded",
      value: totals.orders.toLocaleString("en-US"),
      detail: `${ticketsPerOrder} tickets per order`,
      icon: ReceiptText,
    },
    {
      label: "Expected settlement",
      value: formatMoney(settlement.net, { decimals: false }),
      detail: "before door sales",
      icon: Landmark,
    },
  ];
}

function NavigationLink({ item }: { item: NavigationItem }) {
  const Icon = item.icon;

  return (
    <a
      aria-current={item.active ? "page" : undefined}
      aria-disabled={item.active ? undefined : true}
      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-body transition-colors ${
        item.active
          ? "bg-background text-foreground"
          : "pointer-events-none text-primary-foreground/60"
      }`}
      href="/"
      tabIndex={item.active ? undefined : -1}
      title={item.active ? undefined : "Available in a later step"}
    >
      <Icon className="size-4" />
      <span className="flex-1">{item.label}</span>
      {item.badge ? (
        <span
          aria-hidden="true"
          className="flex size-5 items-center justify-center rounded-full bg-warning text-caption text-warning-foreground"
        >
          {item.badge}
        </span>
      ) : null}
    </a>
  );
}

function Sidebar({ event }: { event: EventRecord }) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-primary text-primary-foreground lg:flex">
      <div className="flex h-20 items-center gap-3 px-5">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Ticket className="size-5" />
        </div>
        <div>
          <p className="font-semibold text-body-base">Barrels</p>
          <p className="text-caption text-primary-foreground/70">Events</p>
        </div>
      </div>

      <div className="px-3">
        <Button
          aria-label="Select event"
          className="h-auto w-full justify-start border-primary-foreground/15 bg-primary-foreground/5 px-3 py-3 text-left text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          disabled
          size="lg"
          title="Available in a later step"
          type="button"
          variant="outline"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-foreground/10">
            <CalendarDays className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-caption text-primary-foreground/65">
              {event.isDemo ? "Demo event" : "Selected event"}
            </span>
            <span className="block truncate text-body">{event.name}</span>
          </span>
          <ChevronDown className="size-4 text-primary-foreground/65" />
        </Button>
      </div>

      <nav aria-label="Event workspace" className="mt-5 flex-1 space-y-1 px-3">
        {navigation.map((item) => (
          <NavigationLink item={item} key={item.label} />
        ))}
      </nav>

      <div className="space-y-1 border-primary-foreground/10 border-t p-3">
        <a
          aria-disabled="true"
          className="pointer-events-none flex min-h-11 items-center gap-3 rounded-lg px-3 text-body text-primary-foreground/60"
          href="/"
          tabIndex={-1}
          title="Available in a later step"
        >
          <LifeBuoy className="size-4" />
          Support
        </a>
        <div className="flex items-center gap-3 px-3 py-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary-foreground/10 font-semibold text-caption">
            EG
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body">Eugine G.</p>
            <p className="truncate text-caption text-primary-foreground/60">
              Owner
            </p>
          </div>
          <MoreHorizontal className="size-4 text-primary-foreground/60" />
        </div>
      </div>
    </aside>
  );
}

function MobileHeader({ event }: { event: EventRecord }) {
  return (
    <header className="border-border border-b bg-card px-4 py-3 lg:hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Ticket className="size-4" />
          </div>
          <div>
            <p className="font-semibold text-body-base">Barrels Events</p>
            <p className="text-caption text-muted-foreground">{event.name}</p>
          </div>
        </div>
        <Button
          aria-label="Open notifications"
          disabled
          size="icon"
          title="Available in a later step"
          variant="ghost"
        >
          <Bell />
        </Button>
      </div>
      <nav
        aria-label="Mobile event workspace"
        className="-mx-4 mt-3 flex gap-2 overflow-x-auto border-border border-t px-4 pt-3"
      >
        {navigation.map((item) => (
          <a
            aria-current={item.active ? "page" : undefined}
            aria-disabled={item.active ? undefined : true}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3 text-caption ${
              item.active
                ? "bg-primary text-primary-foreground"
                : "pointer-events-none bg-muted text-muted-foreground opacity-60"
            }`}
            href="/"
            key={item.label}
            tabIndex={item.active ? undefined : -1}
            title={item.active ? undefined : "Available in a later step"}
          >
            {item.label}
            {item.badge ? <span aria-hidden="true">{item.badge}</span> : null}
          </a>
        ))}
      </nav>
    </header>
  );
}

function MetricCard({ detail, icon: Icon, label, value }: Metric) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardAction>
          <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Icon className="size-4" />
          </span>
        </CardAction>
        <CardTitle className="text-heading-md tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
          {label === "Gross sales" ? (
            <TrendingUp className="size-3.5 text-success-foreground" />
          ) : null}
          {detail}
        </p>
      </CardContent>
    </Card>
  );
}

function ReadinessTile({ check }: { check: ReadinessCheck }) {
  const Icon = READINESS_ICONS[check.id] ?? Check;
  const isComplete = check.state === "complete";

  return (
    <div
      className={`flex gap-3 rounded-lg border p-3 ${
        isComplete ? "border-border" : "border-warning bg-warning"
      }`}
    >
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          isComplete
            ? "bg-success text-success-foreground"
            : "bg-warning text-warning-foreground"
        }`}
      >
        <Icon className="size-4" />
      </span>
      <div>
        <p className="font-medium text-body">{check.title}</p>
        <p className="mt-1 text-caption text-muted-foreground">
          {check.detail}
        </p>
      </div>
    </div>
  );
}

function EventReadiness({
  actionCount,
  checks,
  percent,
}: {
  actionCount: number;
  checks: readonly ReadinessCheck[];
  percent: number;
}) {
  return (
    <Card className="lg:col-span-7">
      <CardHeader className="border-b">
        <CardTitle>
          <h2>Event readiness</h2>
        </CardTitle>
        <CardDescription>
          The operating checks that must be true before doors open.
        </CardDescription>
        <CardAction>
          <Badge variant="light-warning">{actionCount} actions</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        <Progress value={percent}>
          <ProgressLabel>Overall readiness</ProgressLabel>
          <ProgressValue />
        </Progress>

        <div className="grid gap-3 sm:grid-cols-2">
          {checks.map((check) => (
            <ReadinessTile check={check} key={check.id} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function NextActions({ actions }: { actions: readonly NextAction[] }) {
  return (
    <Card className="lg:col-span-5">
      <CardHeader className="border-b">
        <CardTitle>
          <h2>Next actions</h2>
        </CardTitle>
        <CardDescription>
          Resolve these before Friday at 5:00 PM.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {actions.map((action, index) => (
          <div key={action.id}>
            <a
              aria-disabled="true"
              className="pointer-events-none flex items-start gap-3 rounded-lg py-3 opacity-75"
              href="/"
              tabIndex={-1}
              title="Available in a later step"
            >
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-caption">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-body">{action.title}</span>
                  <Badge
                    variant={
                      action.priority === "required"
                        ? "light-error"
                        : "light-warning"
                    }
                  >
                    {action.statusLabel}
                  </Badge>
                </span>
                <span className="mt-1 block text-caption text-muted-foreground">
                  {action.detail}
                </span>
              </span>
              <ArrowRight className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </a>
            {index < actions.length - 1 ? <Separator /> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SalesChannels({ channels }: { channels: readonly ChannelSales[] }) {
  return (
    <Card className="lg:col-span-8">
      <CardHeader className="border-b">
        <CardTitle>
          <h2>Sales channels</h2>
        </CardTitle>
        <CardDescription>
          One record across online, agent and complimentary inventory.
        </CardDescription>
        <CardAction>
          <Button
            disabled
            size="sm"
            title="Available in a later step"
            variant="outline"
          >
            View orders
            <ArrowRight data-icon="inline-end" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Channel</TableHead>
              <TableHead>Orders</TableHead>
              <TableHead>Tickets</TableHead>
              <TableHead>Gross</TableHead>
              <TableHead className="pr-4">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((row) => (
              <TableRow key={row.channel}>
                <TableCell className="pl-4 font-medium">{row.label}</TableCell>
                <TableCell className="tabular-nums">
                  {row.orders.toLocaleString("en-US")}
                </TableCell>
                <TableCell className="tabular-nums">
                  {row.tickets.toLocaleString("en-US")}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatMoney(row.gross, { decimals: false })}
                </TableCell>
                <TableCell className="pr-4">
                  <Badge
                    variant={
                      row.reconciliation === "needs-count"
                        ? "light-warning"
                        : "light-success"
                    }
                  >
                    {RECONCILIATION_LABELS[row.reconciliation]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SettlementPreviewCard({
  settlement,
}: {
  settlement: SettlementPreview;
}) {
  return (
    <Card className="lg:col-span-4">
      <CardHeader className="border-b">
        <CardTitle>
          <h2>Settlement preview</h2>
        </CardTitle>
        <CardDescription>Expected organiser payout</CardDescription>
        <CardAction>
          <Badge variant="light-primary">Estimate</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-heading-lg tabular-nums">
            {formatMoney(settlement.net)}
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            Across recorded sales and deductions
          </p>
        </div>
        <div className="space-y-2 text-body">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Gross sales</span>
            <span className="tabular-nums">
              {formatMoney(settlement.gross)}
            </span>
          </div>
          {settlement.deductions.map((deduction) => (
            <div className="flex justify-between gap-4" key={deduction.label}>
              <span className="text-muted-foreground">{deduction.label}</span>
              <span className="tabular-nums">
                −{formatMoney(deduction.amount)}
              </span>
            </div>
          ))}
        </div>
        <Separator />
        <Button
          className="w-full"
          disabled
          title="Available in a later step"
          variant="outline"
        >
          Open finance
          <ArrowRight data-icon="inline-end" />
        </Button>
      </CardContent>
    </Card>
  );
}

function OverviewHeader({ event }: { event: EventRecord }) {
  return (
    <div className="border-border border-b bg-card">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="light-success">
                <span className="size-1.5 rounded-full bg-current" />
                {EVENT_STATUS_LABELS[event.status]}
              </Badge>
              {event.isDemo ? (
                <span className="text-caption text-muted-foreground">
                  Demo event
                </span>
              ) : null}
            </div>
            <h1 className="mt-2 font-semibold text-heading-md tracking-tight">
              {event.name}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-body text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                {formatEventDate(event.startsAt)}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4" />
                {event.venue}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              aria-label="Search event records"
              disabled
              size="icon"
              title="Available in a later step"
              variant="ghost"
            >
              <Search />
            </Button>
            <Button
              aria-label="View notifications"
              disabled
              size="icon"
              title="Available in a later step"
              variant="ghost"
            >
              <Bell />
            </Button>
            <Button
              disabled
              title="Available in a later step"
              variant="outline"
            >
              Preview event
              <ExternalLink data-icon="inline-end" />
            </Button>
            <Button disabled title="Available in a later step">
              Manage event
              <ChevronDown data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EventOverview({ dashboard }: { dashboard: EventDashboard }) {
  const {
    actions,
    channels,
    countdownLabel,
    event,
    operational,
    readinessChecks,
    readinessPercent,
    salesTrendLabel,
    settlement,
    totals,
  } = dashboard;

  const metrics = buildMetrics(event, totals, settlement, salesTrendLabel);

  return (
    <div className="min-h-screen bg-muted/30">
      <Sidebar event={event} />
      <div className="lg:pl-64">
        <MobileHeader event={event} />
        <OverviewHeader event={event} />

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {event.isDemo && (
            <p className="mb-6 rounded-xl border border-border bg-card p-4 text-body">
              Demo workspace. All figures are sample data. Ticket sales, orders,
              payments and event management are not available here.
            </p>
          )}
          <section
            aria-labelledby="event-status-heading"
            className="mb-6 flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
                <CircleCheckBig className="size-5" />
              </span>
              <div>
                <h2
                  className="font-semibold text-body-base"
                  id="event-status-heading"
                >
                  Sales are healthy. Operations need attention.
                </h2>
                <p className="mt-1 text-body text-muted-foreground">
                  {countdownLabel} Complete the door rehearsal and payout setup
                  before expanding promotion.
                </p>
              </div>
            </div>
            <Button
              className="shrink-0"
              disabled
              title="Available in a later step"
              variant="outline"
            >
              Review actions
              <ArrowRight data-icon="inline-end" />
            </Button>
          </section>

          <section
            aria-label="Event performance"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {metrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </section>

          <section
            aria-label="Event preparation"
            className="mt-6 grid gap-6 lg:grid-cols-12"
          >
            <EventReadiness
              actionCount={actions.length}
              checks={readinessChecks}
              percent={readinessPercent}
            />
            <NextActions actions={actions} />
          </section>

          <section
            aria-label="Sales and settlement"
            className="mt-6 grid gap-6 lg:grid-cols-12"
          >
            <SalesChannels channels={channels} />
            <SettlementPreviewCard settlement={settlement} />
          </section>

          <section
            aria-label="Operational record"
            className="mt-6 grid gap-4 sm:grid-cols-3"
          >
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <Clock3 className="size-4" />
              </span>
              <div>
                <p className="font-medium text-body">Last payment</p>
                <p className="text-caption text-muted-foreground">
                  {operational.lastPaymentLabel} ·{" "}
                  {operational.lastPaymentChannel}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-warning text-warning-foreground">
                <TriangleAlert className="size-4" />
              </span>
              <div>
                <p className="font-medium text-body">
                  {operational.openExceptions} open exceptions
                </p>
                <p className="text-caption text-muted-foreground">
                  {operational.openExceptionsDetail}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-success text-success-foreground">
                <ShieldCheck className="size-4" />
              </span>
              <div>
                <p className="font-medium text-body">Audit record current</p>
                <p className="text-caption text-muted-foreground">
                  {totals.orders.toLocaleString("en-US")} orders ·{" "}
                  {totals.tickets.toLocaleString("en-US")} tickets
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
