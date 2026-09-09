import { Badge } from "@barrelsgd/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@barrelsgd/ui/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CloudSun, Inbox, Radar } from "lucide-react";
import Link from "next/link";
import { grenadaToday, summarizeImagery, summarizeProducts } from "./home-data";
import { loadAlerts, loadHr, loadImagery, loadProducts } from "./home-loaders";

type StatusVariant = "light-error" | "light-success" | "light-warning";

interface Tile {
  hint: string;
  href: string;
  icon: LucideIcon;
  id: string;
  label: string;
  status?: { label: string; variant: StatusVariant };
  value: string;
}

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

function alertTile(alerts: Awaited<ReturnType<typeof loadAlerts>>): Tile {
  const count = alerts.ok ? alerts.data.data.length : null;
  return {
    hint: alerts.ok ? "Currently in effect" : alerts.message,
    href: "/cap",
    icon: AlertTriangle,
    id: "alerts",
    label: "Active CAP alerts",
    status:
      count && count > 0
        ? { label: "In effect", variant: "light-error" }
        : undefined,
    value: count === null ? "—" : String(count),
  };
}

function productTile(products: Awaited<ReturnType<typeof loadProducts>>): Tile {
  const base = {
    href: "/wxproducts/fcsts",
    icon: CloudSun,
    id: "products",
    label: "Products issued today",
  };
  if (!products.ok) {
    return { ...base, hint: products.message, value: "—" };
  }

  const summary = summarizeProducts(products.data, grenadaToday());
  const complete = summary.issued === summary.expected;
  return {
    ...base,
    hint: `${plural(summary.bulletins.length, "bulletin")} live`,
    status: complete
      ? { label: "Complete", variant: "light-success" }
      : { label: "Pending", variant: "light-warning" },
    value: `${summary.issued} / ${summary.expected}`,
  };
}

function imageryTile(imagery: Awaited<ReturnType<typeof loadImagery>>): Tile {
  const base = {
    href: "/wxwatch",
    icon: Radar,
    id: "imagery",
    label: "Imagery captured today",
  };
  if (!imagery.ok) {
    return { ...base, hint: imagery.message, value: "—" };
  }

  const summary = summarizeImagery(imagery.data);
  return {
    ...base,
    hint: `${plural(summary.sources, "source")} tracked`,
    value: `${summary.captured} / ${summary.expected}`,
  };
}

function approvalTile(hr: Awaited<ReturnType<typeof loadHr>>): Tile {
  const base = {
    href: "/hr/approvals",
    icon: Inbox,
    id: "approvals",
    label: "Awaiting your approval",
  };
  if (!hr.ok) {
    return { ...base, hint: hr.message, value: "—" };
  }

  const waiting = hr.data.approvals?.length ?? 0;
  return {
    ...base,
    hint: `${plural(hr.data.open_requests, "open request")} in total`,
    status:
      waiting > 0
        ? { label: "Action needed", variant: "light-warning" as const }
        : undefined,
    value: String(waiting),
  };
}

export async function StatusStrip() {
  const [alerts, products, imagery, hr] = await Promise.all([
    loadAlerts(),
    loadProducts(),
    loadImagery(),
    loadHr(),
  ]);

  const tiles = [
    alertTile(alerts),
    productTile(products),
    imageryTile(imagery),
    approvalTile(hr),
  ];

  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {tiles.map((tile) => (
        <StatusTile key={tile.id} tile={tile} />
      ))}
    </div>
  );
}

function StatusTile({ tile }: { tile: Tile }) {
  const Icon = tile.icon;

  return (
    <Link
      className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={tile.href}
    >
      <Card className="h-full transition-colors hover:border-primary/40">
        <CardHeader>
          <CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              <Icon className="size-4" />
            </div>
          </CardTitle>
          <CardDescription>{tile.label}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
              {tile.value}
            </div>
            {tile.status ? (
              <Badge variant={tile.status.variant}>{tile.status.label}</Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">{tile.hint}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
