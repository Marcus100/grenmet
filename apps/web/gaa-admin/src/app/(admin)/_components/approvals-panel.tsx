import { Badge } from "@barrelsgd/ui/components/ui/badge";
import Link from "next/link";
import { relativeTime } from "./home-data";
import { loadHr } from "./home-loaders";
import { Panel, PanelEmpty, PanelUnavailable } from "./panel";

const MAX_APPROVALS = 5;

export async function ApprovalsPanel({ className }: { className?: string }) {
  const hr = await loadHr();

  if (!hr.ok) {
    return (
      <Panel
        className={className}
        description="HR requests waiting on you"
        title="Approvals"
      >
        <PanelUnavailable message={hr.message} />
      </Panel>
    );
  }

  const approvals = (hr.data.approvals ?? []).slice(0, MAX_APPROVALS);

  return (
    <Panel
      action={{ href: "/hr/approvals", label: "Inbox" }}
      className={className}
      description={
        hr.data.can_approve
          ? "HR requests waiting on you"
          : "Your submitted requests"
      }
      title="Approvals"
    >
      {approvals.length === 0 ? (
        <PanelEmpty>Nothing waiting on you.</PanelEmpty>
      ) : (
        <ul className="divide-y">
          {approvals.map((approval) => (
            <li key={approval.id}>
              <Link
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                href="/hr/approvals"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">
                    {approval.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {relativeTime(approval.submitted_at)}
                  </p>
                </div>
                <Badge variant="light-light">{approval.kind}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
