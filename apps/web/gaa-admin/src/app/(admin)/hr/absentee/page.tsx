import type { Metadata } from "next";
import { AbsenteeEditor } from "@/components/hr/absentee/absentee-editor";
import { AbsenteeSubmissions } from "@/components/hr/absentee/absentee-submissions";

export const metadata: Metadata = {
  title: "Absentee Report",
  description: "Absentee report — edit and preview",
};

export default function AbsenteePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Absentee Report
        </h1>
        <p className="text-muted-foreground text-sm">
          Fill in the form to preview the document, then print or export.
        </p>
      </div>
      <AbsenteeEditor />
      <AbsenteeSubmissions />
    </div>
  );
}
