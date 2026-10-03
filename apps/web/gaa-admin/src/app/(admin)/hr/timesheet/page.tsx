import type { Metadata } from "next";
import { AttendanceTimesheet } from "@/components/hr/timesheet/attendance-timesheet";
import { TimesheetEditor } from "@/components/hr/timesheet/timesheet-editor";
import { TimesheetSubmissions } from "@/components/hr/timesheet/timesheet-submissions";

export const metadata: Metadata = {
  title: "Time Sheet",
  description: "Official time sheet — edit and preview",
};

export default function TimesheetPage() {
  return (
    <div className="@container space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Official Time Sheet
        </h1>
        <p className="text-muted-foreground text-sm">
          Add entries to preview the time sheet, then print or export.
        </p>
      </div>
      <AttendanceTimesheet />
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium text-sm">
          Manual timesheet form
        </summary>
        <TimesheetEditor />
      </details>
      <TimesheetSubmissions />
    </div>
  );
}
