import { Badge } from "@grenmet/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@grenmet/ui/components/ui/card";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CloudSun,
  Radar,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

interface Metric {
  delta: string;
  deltaUp: boolean;
  deltaVariant?: "default" | "destructive";
  hint: string;
  icon: LucideIcon;
  id: string;
  label: string;
  value: string;
}

const metrics: Metric[] = [
  {
    id: "alerts",
    label: "Active CAP Alerts",
    value: "3",
    icon: AlertTriangle,
    delta: "+1",
    deltaUp: true,
    deltaVariant: "destructive",
    hint: "Currently in effect",
  },
  {
    id: "stations",
    label: "Stations Online",
    value: "12 / 14",
    icon: Radar,
    delta: "+2",
    deltaUp: true,
    hint: "WxWatch reporting",
  },
  {
    id: "forecasts",
    label: "Forecasts Issued Today",
    value: "4",
    icon: CloudSun,
    delta: "On schedule",
    deltaUp: true,
    hint: "Public products published",
  },
  {
    id: "leave",
    label: "Open Leave Requests",
    value: "7",
    icon: Users,
    delta: "-2",
    deltaUp: false,
    hint: "Awaiting HR approval",
  },
];

export function HomeMetricCards() {
  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {metrics.map((m) => {
        const Icon = m.icon;
        const Trend = m.deltaUp ? TrendingUp : TrendingDown;
        return (
          <Card key={m.id}>
            <CardHeader>
              <CardTitle>
                <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </div>
              </CardTitle>
              <CardDescription>{m.label}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
                  {m.value}
                </div>
                <Badge variant={m.deltaVariant}>
                  <Trend className="size-3" />
                  {m.delta}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">{m.hint}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
