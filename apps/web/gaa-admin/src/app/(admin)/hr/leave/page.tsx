import type { Metadata } from "next";
import { LeaveApplicationEditor } from "@/components/hr/leave/leave-application-editor";
import { LeaveSubmissions } from "@/components/hr/leave/leave-submissions";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Leave Application",
  description: "Application for leave of absence — edit, submit, and preview",
};

export default function LeaveApplicationPage() {
  return (
    <div className="@container space-y-6">
      <PageHeader
        description="Fill in the form, submit it to HR, and print the signed copy."
        title="Application for Leave of Absence"
      />
      <LeaveApplicationEditor />
      <LeaveSubmissions />
    </div>
  );
}
