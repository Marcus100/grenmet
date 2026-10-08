import type { Metadata } from "next";
import { HrSetupTabs } from "@/components/hr/setup/hr-setup-tabs";

export const metadata: Metadata = {
  title: "HR Setup",
  description:
    "Configure employer organisations, departments, grades and staff onboarding.",
};

export default function HrSetupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">HR Setup</h1>
        <p className="text-muted-foreground text-sm">
          Choose an organisation to manage its departments, grades and staff
          onboarding.
        </p>
      </div>
      <HrSetupTabs />
    </div>
  );
}
