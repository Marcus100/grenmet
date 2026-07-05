import type { Metadata } from "next";
import { LeaveApplicationEditor } from "@/components/hr/leave/leave-application-editor";
import { LeaveSubmissions } from "@/components/hr/leave/leave-submissions";

export const metadata: Metadata = {
  title: "Leave Application",
  description: "Application for leave of absence — edit, submit, and preview",
};

export default function LeaveApplicationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Application for Leave of Absence
        </h1>
        <p className="text-muted-foreground text-sm">
          Fill in the form, submit it to HR, and print the signed copy.
        </p>
      </div>
      <LeaveApplicationEditor />
      <LeaveSubmissions />
    </div>
  );
}
