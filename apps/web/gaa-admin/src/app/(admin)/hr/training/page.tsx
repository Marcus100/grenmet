import type { Metadata } from "next";
import { TrainingWorkspace } from "@/components/hr/training/training-workspace";

export const metadata: Metadata = { title: "Employee training | GAA" };
export default function TrainingPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-medium text-3xl">Employee training</h1>
        <p className="text-muted-foreground">
          Record training outcomes and review employee training history.
        </p>
      </div>
      <TrainingWorkspace />
    </div>
  );
}
