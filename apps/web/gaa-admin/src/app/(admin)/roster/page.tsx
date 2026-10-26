import type { Metadata } from "next";
import { DutyRoster } from "@/components/hr/roster/duty-roster";
import { ImportRosterDialog } from "@/components/hr/roster/import-roster-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { WideContent } from "@/components/layout/wide-content";

export const metadata: Metadata = {
  title: "Duty Roster",
  description: "Meteorological department duty roster, aligned to the calendar",
};

export default function RosterPage() {
  return (
    <WideContent className="space-y-6">
      <PageHeader
        actions={<ImportRosterDialog />}
        description="Meteorological Department — assign shifts per day for the selected month."
        title="Duty Roster"
      />
      <DutyRoster />
    </WideContent>
  );
}
