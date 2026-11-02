import type { Metadata } from "next";
import { AttendanceTimesheet } from "@/components/hr/timesheet/attendance-timesheet";
import { TimesheetEditor } from "@/components/hr/timesheet/timesheet-editor";
import { TimesheetSubmissions } from "@/components/hr/timesheet/timesheet-submissions";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Time Sheet",
  description: "Official time sheet — edit and preview",
};

export default function TimesheetPage() {
  return (
    <div className="@container space-y-6">
      <PageHeader
        description="Add entries to preview the time sheet, then print or export."
        title="Official Time Sheet"
      />
      <AttendanceTimesheet />
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Manual timesheet form
        </summary>
        <TimesheetEditor />
      </details>
      <TimesheetSubmissions />
    </div>
  );
}
