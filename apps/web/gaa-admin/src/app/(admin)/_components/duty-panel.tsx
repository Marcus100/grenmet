import type { DashboardPerson } from "@barrelsgd/api-client";
import { DutyTabs } from "./duty-tabs";
import { loadHr } from "./home-loaders";
import { Panel, PanelUnavailable } from "./panel";

export async function DutyPanel({ className }: { className?: string }) {
  const hr = await loadHr();

  return (
    <Panel
      action={{ href: "/roster", label: "Duty roster" }}
      className={className}
      description="Roster for today, from the published duty schedule"
      title="On duty"
    >
      {hr.ok ? (
        <DutyTabs
          away={(hr.data.away ?? []) as DashboardPerson[]}
          onDuty={(hr.data.on_duty ?? []) as DashboardPerson[]}
        />
      ) : (
        <PanelUnavailable message={hr.message} />
      )}
    </Panel>
  );
}
