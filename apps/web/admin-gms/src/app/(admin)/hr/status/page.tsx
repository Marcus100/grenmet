import type { Metadata } from "next";
import { DailyStatusEditor } from "@/components/hr/status/daily-status-editor";

export const metadata: Metadata = {
  title: "Daily Airport Status",
  description: "Daily airport status report — edit and preview",
};

export default function DailyStatusPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Daily Airport Status Report
        </h1>
        <p className="text-muted-foreground text-sm">
          Fill in the form to preview the document, then print or export.
        </p>
      </div>
      <DailyStatusEditor />
    </div>
  );
}
