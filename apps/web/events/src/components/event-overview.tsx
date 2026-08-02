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

interface NavigationItem {
  active?: boolean;
  badge?: string;
  icon: ComponentType<{ className?: string }>;
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

const metrics = [
  {
    label: "Gross sales",
    value: "$18,420",
    detail: "+12.4% this week",
    icon: CircleDollarSign,
  },
  {
    label: "Tickets issued",
    value: "742",
    detail: "of 1,200 capacity",
    icon: Ticket,
  },
  {
    label: "Orders recorded",
    value: "516",
    detail: "1.4 tickets per order",
    icon: ReceiptText,
  },
  {
    label: "Expected settlement",
    value: "$16,884",
    detail: "before door sales",
    icon: Landmark,
  },
];

const channels = [
  {
    channel: "Online checkout",
    orders: "436",
    tickets: "626",
    gross: "$16,470",
    status: "Reconciled",
  },
  {
    channel: "Agent allocation",
    orders: "62",
    tickets: "78",
    gross: "$1,950",
    status: "Needs count",
  },
  {
    channel: "Complimentary",
    orders: "18",
    tickets: "38",
    gross: "$0",
    status: "Recorded",
  },
];

const checklist = [
  {
    title: "Connect payout account",
    detail: "Required before the first settlement can be released.",
    status: "Required",
  },
  {
    title: "Confirm agent inventory",
    detail: "Two allocations have not submitted a final sold count.",
    status: "Attention",
  },
  {
    title: "Download the door plan",
    detail: "Prepare two scanning devices for degraded connectivity.",
    status: "Due Friday",
  },
];

function NavigationLink({ item }: { item: NavigationItem }) {
  const Icon = item.icon;

  return (
    <a
      aria-current={item.active ? "page" : undefined}
      aria-disabled={item.active ? undefined : true}
      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-gm-body transition-colors ${
        item.active
          ? "bg-background text-foreground"
          : "pointer-events-none text-gm-text-inverse/60"
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
          className="flex size-5 items-center justify-center rounded-full bg-gm-warning-amber-bg text-gm-caption text-gm-warning-amber-fg"
        >
          {item.badge}
        </span>
      ) : null}
    </a>
  );
}

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-gm-navy text-gm-text-inverse lg:flex">
      <div className="flex h-20 items-center gap-3 px-5">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Ticket className="size-5" />
        </div>
        <div>
          <p className="font-semibold text-gm-body-base">Barrels</p>
          <p className="text-gm-caption text-gm-text-inverse/70">Events</p>
        </div>
      </div>

      <div className="px-3">
        <Button
          aria-label="Select event"
          className="h-auto w-full justify-start border-gm-text-inverse/15 bg-gm-text-inverse/5 px-3 py-3 text-left text-gm-text-inverse hover:bg-gm-text-inverse/10 hover:text-gm-text-inverse"
          disabled
          size="lg"
          title="Available in a later step"
          type="button"
          variant="outline"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-gm-text-inverse/10">
            <CalendarDays className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-gm-caption text-gm-text-inverse/65">
              Demo event
            </span>
            <span className="block truncate text-gm-body">
              Feel Free: Sunset
            </span>
          </span>
          <ChevronDown className="size-4 text-gm-text-inverse/65" />
        </Button>
      </div>

      <nav aria-label="Event workspace" className="mt-5 flex-1 space-y-1 px-3">
        {navigation.map((item) => (
          <NavigationLink item={item} key={item.label} />
        ))}
      </nav>

      <div className="space-y-1 border-gm-text-inverse/10 border-t p-3">
        <a
          aria-disabled="true"
          className="pointer-events-none flex min-h-11 items-center gap-3 rounded-lg px-3 text-gm-body text-gm-text-inverse/60"
          href="/"
          tabIndex={-1}
          title="Available in a later step"
        >
          <LifeBuoy className="size-4" />
          Support
        </a>
        <div className="flex items-center gap-3 px-3 py-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-gm-text-inverse/10 font-semibold text-gm-caption">
            EG
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-gm-body">Eugine G.</p>
            <p className="truncate text-gm-caption text-gm-text-inverse/60">
              Owner
            </p>
          </div>
          <MoreHorizontal className="size-4 text-gm-text-inverse/60" />
        </div>
      </div>
    </aside>
  );
}

function MobileHeader() {
  return (
    <header className="border-border border-b bg-card px-4 py-3 lg:hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Ticket className="size-4" />
          </div>
          <div>
            <p className="font-semibold text-gm-body-base">Barrels Events</p>
            <p className="text-gm-caption text-muted-foreground">
              Feel Free: Sunset
            </p>
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
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3 text-gm-caption ${
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

function MetricCard({
  detail,
  icon: Icon,
  label,
  value,
}: (typeof metrics)[number]) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardAction>
          <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Icon className="size-4" />
          </span>
        </CardAction>
        <CardTitle className="text-gm-heading-md tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="flex items-center gap-1.5 text-gm-caption text-muted-foreground">
          {label === "Gross sales" ? (
            <TrendingUp className="size-3.5 text-gm-warning-green-fg" />
          ) : null}
          {detail}
        </p>
      </CardContent>
    </Card>
  );
}

function EventReadiness() {
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
          <Badge variant="light-warning">3 actions</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        <Progress value={72}>
          <ProgressLabel>Overall readiness</ProgressLabel>
          <ProgressValue />
        </Progress>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex gap-3 rounded-lg border border-border p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gm-warning-green-bg text-gm-warning-green-fg">
              <Check className="size-4" />
            </span>
            <div>
              <p className="font-medium text-gm-body">Event and inventory</p>
              <p className="mt-1 text-gm-caption text-muted-foreground">
                Published with three ticket types and a recorded capacity.
              </p>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg border border-border p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gm-warning-green-bg text-gm-warning-green-fg">
              <Check className="size-4" />
            </span>
            <div>
              <p className="font-medium text-gm-body">Guest journey</p>
              <p className="mt-1 text-gm-caption text-muted-foreground">
                Checkout, confirmation and admission credential tested.
              </p>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg border border-gm-warning-amber-border bg-gm-warning-amber-bg p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gm-warning-amber-bg text-gm-warning-amber-fg">
              <WifiOff className="size-4" />
            </span>
            <div>
              <p className="font-medium text-gm-body">Door operation</p>
              <p className="mt-1 text-gm-caption text-muted-foreground">
                Offline device rehearsal and fallback roster still required.
              </p>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg border border-gm-warning-amber-border bg-gm-warning-amber-bg p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gm-warning-amber-bg text-gm-warning-amber-fg">
              <Landmark className="size-4" />
            </span>
            <div>
              <p className="font-medium text-gm-body">Settlement</p>
              <p className="mt-1 text-gm-caption text-muted-foreground">
                Payout account and organiser acceptance contact are incomplete.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NextActions() {
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
        {checklist.map((item, index) => (
          <div key={item.title}>
            <a
              aria-disabled="true"
              className="pointer-events-none flex items-start gap-3 rounded-lg py-3 opacity-75"
              href="/"
              tabIndex={-1}
              title="Available in a later step"
            >
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-gm-caption">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gm-body">{item.title}</span>
                  <Badge
                    variant={
                      item.status === "Required"
                        ? "light-error"
                        : "light-warning"
                    }
                  >
                    {item.status}
                  </Badge>
                </span>
                <span className="mt-1 block text-gm-caption text-muted-foreground">
                  {item.detail}
                </span>
              </span>
              <ArrowRight className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </a>
            {index < checklist.length - 1 ? <Separator /> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SalesChannels() {
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
                <TableCell className="pl-4 font-medium">
                  {row.channel}
                </TableCell>
                <TableCell className="tabular-nums">{row.orders}</TableCell>
                <TableCell className="tabular-nums">{row.tickets}</TableCell>
                <TableCell className="tabular-nums">{row.gross}</TableCell>
                <TableCell className="pr-4">
                  <Badge
                    variant={
                      row.status === "Needs count"
                        ? "light-warning"
                        : "light-success"
                    }
                  >
                    {row.status}
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

function SettlementPreview() {
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
          <p className="text-gm-heading-lg tabular-nums">$16,884.20</p>
          <p className="mt-1 text-gm-caption text-muted-foreground">
            Across recorded sales and deductions
          </p>
        </div>
        <div className="space-y-2 text-gm-body">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Gross sales</span>
            <span className="tabular-nums">$18,420.00</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Refunds</span>
            <span className="tabular-nums">−$240.00</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Provider fees</span>
            <span className="tabular-nums">−$895.80</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Barrels fee</span>
            <span className="tabular-nums">−$400.00</span>
          </div>
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

function OverviewHeader() {
  return (
    <div className="border-border border-b bg-card">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="light-success">
                <span className="size-1.5 rounded-full bg-current" />
                On sale
              </Badge>
              <span className="text-gm-caption text-muted-foreground">
                Demo event
              </span>
            </div>
            <h1 className="mt-2 font-semibold text-gm-heading-md tracking-tight">
              Feel Free: Sunset
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-gm-body text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                Saturday, 15 August · 4:00 PM
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4" />
                Grenada National Stadium
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

export function EventOverview() {
  return (
    <div className="min-h-screen bg-muted/30">
      <Sidebar />
      <div className="lg:pl-64">
        <MobileHeader />
        <OverviewHeader />

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <section
            aria-labelledby="event-status-heading"
            className="mb-6 flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gm-warning-green-bg text-gm-warning-green-fg">
                <CircleCheckBig className="size-5" />
              </span>
              <div>
                <h2
                  className="font-semibold text-gm-body-base"
                  id="event-status-heading"
                >
                  Sales are healthy. Operations need attention.
                </h2>
                <p className="mt-1 text-gm-body text-muted-foreground">
                  The event is 17 days away. Complete the door rehearsal and
                  payout setup before expanding promotion.
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
            <EventReadiness />
            <NextActions />
          </section>

          <section
            aria-label="Sales and settlement"
            className="mt-6 grid gap-6 lg:grid-cols-12"
          >
            <SalesChannels />
            <SettlementPreview />
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
                <p className="font-medium text-gm-body">Last payment</p>
                <p className="text-gm-caption text-muted-foreground">
                  12 minutes ago · Online
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-gm-warning-amber-bg text-gm-warning-amber-fg">
                <TriangleAlert className="size-4" />
              </span>
              <div>
                <p className="font-medium text-gm-body">2 open exceptions</p>
                <p className="text-gm-caption text-muted-foreground">
                  Agent count and payout setup
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-gm-warning-green-bg text-gm-warning-green-fg">
                <ShieldCheck className="size-4" />
              </span>
              <div>
                <p className="font-medium text-gm-body">Audit record current</p>
                <p className="text-gm-caption text-muted-foreground">
                  516 orders · 742 tickets
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
