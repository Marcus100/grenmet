import type { AlertsResult, HazardGroup, PublicAlert } from "@/lib/cap";

const SEVERITY_CLASS: Record<PublicAlert["severity"], string> = {
  Extreme: "bg-gm-risk-red",
  Severe: "bg-gm-risk-amber",
  Moderate: "bg-gm-risk-yellow",
  Minor: "bg-gm-risk-green",
  Unknown: "bg-gm-risk-grey",
};

function AlertRow({ alert }: { alert: PublicAlert }) {
  return (
    <li className="flex gap-3 border-gm-border border-t p-4 first:border-t-0 lg:p-5">
      <span
        aria-hidden="true"
        className={`mt-1 size-3 shrink-0 rounded-full ${SEVERITY_CLASS[alert.severity]}`}
      />
      <div className="flex flex-col gap-1">
        <p className="font-bold text-body-base text-gm-navy leading-body-base">
          {alert.event}
        </p>
        <p className="text-body text-gm-text-secondary leading-body">
          {alert.headline}
        </p>
        <p className="text-gm-text-muted text-label leading-label">
          {alert.severity}
          {alert.areas.length > 0 && ` · ${alert.areas.join(", ")}`}
          {alert.expires && ` · until ${alert.expires}`}
        </p>
      </div>
    </li>
  );
}

function GroupCard({ group }: { group: HazardGroup }) {
  return (
    <div className="rounded border border-gm-border bg-background">
      <p className="border-gm-border border-b bg-gm-surface px-4 py-2.5 font-bold text-gm-navy text-label leading-label lg:px-5">
        {group.name}
      </p>
      {group.alerts.length === 0 ? (
        <p className="p-4 text-body text-gm-text-secondary leading-body lg:p-5">
          Nothing in effect.
        </p>
      ) : (
        <ul>
          {group.alerts.map((alert) => (
            <AlertRow alert={alert} key={alert.identifier} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Renders live CAP groups. When the feed is unavailable the wording matches
 * AlertsPanel deliberately: an unreachable feed must never be presented as
 * "no warnings in effect".
 */
export function AlertGroups({
  emptyLabel = "There are no warnings in effect for Grenada, Carriacou or Petite Martinique.",
  only,
  result,
}: {
  emptyLabel?: string;
  only?: readonly string[];
  result: AlertsResult;
}) {
  if (result.status === "unavailable") {
    return (
      <div className="rounded border border-gm-risk-amber bg-gm-surface p-4 lg:p-5">
        <p className="text-body text-gm-text-secondary leading-body">
          Warning information cannot be retrieved right now. This does not mean
          there are no warnings in effect — check the Grenada Meteorological
          Service directly.
        </p>
      </div>
    );
  }

  const groups = only
    ? result.groups.filter((group) => only.includes(group.name))
    : result.groups;
  const total = groups.reduce((sum, group) => sum + group.alerts.length, 0);

  if (total === 0) {
    return (
      <div className="rounded border border-gm-border bg-background p-4 lg:p-5">
        <p className="text-body text-gm-text-secondary leading-body">
          {emptyLabel}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups
        .filter((group) => group.alerts.length > 0)
        .map((group) => (
          <GroupCard group={group} key={group.name} />
        ))}
    </div>
  );
}
