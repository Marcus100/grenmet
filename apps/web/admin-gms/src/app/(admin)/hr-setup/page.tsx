import type { Metadata } from "next";
import { HrSetupTabs } from "@/components/hr/setup/hr-setup-tabs";

export const metadata: Metadata = {
  title: "HR Setup",
  description:
    "Configure the shift types and departments used by duty rosters.",
};

export default function HrSetupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">HR Setup</h1>
        <p className="text-muted-foreground text-sm">
          Configure the building blocks a duty roster is assigned from — the
          shift types and the departments that group staff.
        </p>
      </div>
      <HrSetupTabs />
    </div>
  );
}
