import { Badge } from "@barrelsgd/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@barrelsgd/ui/components/ui/card";
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

/** Status is always written out, never colour alone. */
export function StatusCard({ card }: { card: StatusCardData }) {
  return (
    <Card data-status={card.tone} data-testid={`status-${card.id}`}>
      <CardHeader>
        <CardDescription>{card.title}</CardDescription>
        <CardTitle className="text-2xl">{card.summary}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Badge variant={TONE_VARIANT[card.tone]}>{TONE_LABEL[card.tone]}</Badge>
        <p className="text-muted-foreground text-sm">{card.detail}</p>
      </CardContent>
    </Card>
  );
}
