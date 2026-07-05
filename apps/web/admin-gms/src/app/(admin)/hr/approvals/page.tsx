import type { Metadata } from "next";
import { ApprovalsInbox } from "@/components/hr/approvals-inbox";

export const metadata: Metadata = {
  title: "Approvals",
  description: "HR requests awaiting your approval",
};

export default function ApprovalsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Approvals</h1>
        <p className="text-muted-foreground text-sm">
          Requests awaiting your approval — as a named co-approver or your
          department role.
        </p>
      </div>
      <ApprovalsInbox />
    </div>
  );
}
