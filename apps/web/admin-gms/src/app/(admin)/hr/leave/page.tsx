import type { Metadata } from "next";
import { LeaveApplicationEditor } from "@/components/hr/leave/leave-application-editor";

export const metadata: Metadata = {
  title: "Leave Application",
  description: "Application for leave of absence — edit and preview",
};

export default function LeaveApplicationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Application for Leave of Absence
        </h1>
        <p className="text-muted-foreground text-sm">
          Fill in the form to preview the document, then print or export.
        </p>
      </div>
      <LeaveApplicationEditor />
    </div>
  );
}
