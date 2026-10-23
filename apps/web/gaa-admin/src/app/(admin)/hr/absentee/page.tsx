import type { Metadata } from "next";
import { AbsenteeEditor } from "@/components/hr/absentee/absentee-editor";
import { AbsenteeSubmissions } from "@/components/hr/absentee/absentee-submissions";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Absentee Report",
  description: "Absentee report — edit and preview",
};

export default function AbsenteePage() {
  return (
    <div className="@container space-y-6">
      <PageHeader
        description="Fill in the form to preview the document, then print or export."
        title="Absentee Report"
      />
      <AbsenteeEditor />
      <AbsenteeSubmissions />
    </div>
  );
}
