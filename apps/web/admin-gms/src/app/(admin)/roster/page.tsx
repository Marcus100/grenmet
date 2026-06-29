import type { Metadata } from "next";
import { DutyRoster } from "@/components/hr/roster/duty-roster";

export const metadata: Metadata = {
  title: "Duty Roster",
  description: "Meteorological department duty roster, aligned to the calendar",
};

export default function RosterPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Duty Roster</h1>
        <p className="text-muted-foreground text-sm">
          Meteorological Department — assign shifts per day for the selected
          month.
        </p>
      </div>
      <DutyRoster />
    </div>
  );
}
