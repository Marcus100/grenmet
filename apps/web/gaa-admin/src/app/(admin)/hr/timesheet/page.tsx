import type { Metadata } from "next";
import { TimesheetEditor } from "@/components/hr/timesheet/timesheet-editor";
import { TimesheetSubmissions } from "@/components/hr/timesheet/timesheet-submissions";

export const metadata: Metadata = {
  title: "Time Sheet",
  description: "Official time sheet — edit and preview",
};

export default function TimesheetPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Official Time Sheet
        </h1>
        <p className="text-muted-foreground text-sm">
          Add entries to preview the time sheet, then print or export.
        </p>
      </div>
      <TimesheetEditor />
      <TimesheetSubmissions />
    </div>
  );
}
