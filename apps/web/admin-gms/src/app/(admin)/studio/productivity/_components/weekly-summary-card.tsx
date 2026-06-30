import { Button } from "@grenmet/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@grenmet/ui/components/ui/card";
import { Progress } from "@grenmet/ui/components/ui/progress";

export function WeeklySummaryCard() {
  return (
    <Card className="shadow-xs">
      <CardHeader>
        <CardTitle>This Week</CardTitle>
        <CardAction>
          <Button className="text-muted-foreground" size="sm" variant="ghost">
            View all
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground">
          You’re doing great. Keep the momentum going.
        </p>
        <div className="flex flex-col gap-2">
          <div className="font-medium">4 of 6 goals completed</div>
          <Progress className="h-2" value={66} />
        </div>
      </CardContent>
    </Card>
  );
}
