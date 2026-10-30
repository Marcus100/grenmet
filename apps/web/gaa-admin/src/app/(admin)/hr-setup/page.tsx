import type { Metadata } from "next";
import { HrSetupTabs } from "@/components/hr/setup/hr-setup-tabs";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "HR Setup",
  description:
    "Configure employer organisations, departments, grades and staff onboarding.",
};

export default function HrSetupPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Choose an organisation to manage its departments, grades and staff onboarding."
        title="HR Setup"
      />
      <HrSetupTabs />
    </div>
  );
}
