import { Badge } from "@barrelsgd/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@barrelsgd/ui/components/ui/card";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  Cpu,
  HeartPulse,
  Tag,
  Workflow,
} from "lucide-react";
import type { StatusCardData, StatusTone } from "@/lib/status";

const TONE_LABEL: Record<StatusTone, string> = {
  ok: "OK",
  down: "Problem",
  unknown: "Unknown",
};

const TONE_VARIANT = {
  ok: "light-success",
  down: "light-error",
  unknown: "light-light",
} as const satisfies Record<StatusTone, string>;

const CARD_ICON: Record<string, LucideIcon> = {
  "api-liveness": HeartPulse,
  "api-readiness": Activity,
  worker: Workflow,
  release: Tag,
  organisations: Building2,
};

/**
 * A status tile in the GMS portal style: icon chip, label, large value and a
 * hint. Status is always written out in the badge, never colour alone.
 */
export function StatusCard({ card }: { card: StatusCardData }) {
  const Icon = CARD_ICON[card.id] ?? Cpu;

  return (
    <Card
      className="h-full"
      data-status={card.tone}
      data-testid={`status-${card.id}`}
    >
      <CardHeader>
        <CardTitle>
          <div className="bg-muted text-muted-foreground flex size-7 items-center justify-center rounded-lg border">
            <Icon aria-hidden="true" className="size-4" />
          </div>
        </CardTitle>
        <CardDescription>{card.title}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-3xl leading-none font-medium tracking-tight tabular-nums">
            {card.summary}
          </div>
          <Badge variant={TONE_VARIANT[card.tone]}>
            {TONE_LABEL[card.tone]}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">{card.detail}</p>
      </CardContent>
    </Card>
  );
}
