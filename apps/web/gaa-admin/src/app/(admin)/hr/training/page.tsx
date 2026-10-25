import type { Metadata } from "next";
import { RecordsTabs } from "@/components/hr/records-tabs";
import { TrainingWorkspace } from "@/components/hr/training/training-workspace";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Employee training | GAA" };
export default function TrainingPage() {
  return (
    <div className="space-y-6">
      <RecordsTabs />
      <PageHeader
        description="Record training outcomes and review employee training history."
        title="Employee training"
      />
      <TrainingWorkspace />
    </div>
  );
}
