import type { Metadata } from "next";
import { DutyRoster } from "@/components/hr/roster/duty-roster";
import { ImportRosterDialog } from "@/components/hr/roster/import-roster-dialog";

export const metadata: Metadata = {
  title: "Duty Roster",
  description: "Meteorological department duty roster, aligned to the calendar",
};

export default function RosterPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Duty Roster</h1>
          <p className="text-muted-foreground text-sm">
            Meteorological Department — assign shifts per day for the selected
            month.
          </p>
        </div>
        <ImportRosterDialog />
      </div>
      <DutyRoster />
    </div>
  );
}
