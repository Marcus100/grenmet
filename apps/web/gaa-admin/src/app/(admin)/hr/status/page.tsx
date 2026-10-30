import type { Metadata } from "next";
import { DailyStatusEditor } from "@/components/hr/status/daily-status-editor";
import { StatusSubmissions } from "@/components/hr/status/status-submissions";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Daily Airport Status",
  description: "Daily airport status report — edit and preview",
};

export default function DailyStatusPage() {
  return (
    <div className="@container space-y-6">
      <PageHeader
        description="Fill in the form to preview the document, then print or export."
        title="Daily Airport Status Report"
      />
      <DailyStatusEditor />
      <StatusSubmissions />
    </div>
  );
}
