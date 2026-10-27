import type { Metadata } from "next";
import { ApprovalsInbox } from "@/components/hr/approvals-inbox";
import { PunchApprovals } from "@/components/hr/clock/punch-approvals";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Approvals",
  description: "HR requests awaiting your approval",
};

export default function ApprovalsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Requests awaiting your approval — as a named co-approver or your department role."
        title="Approvals"
      />
      <ApprovalsInbox />
      <PunchApprovals />
    </div>
  );
}
