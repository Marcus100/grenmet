import { PageHeader } from "@/components/page-header";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";

export const metadata = {
  title: "Monthly climate summary",
  description:
    "How last month compared with normal across the tri-island state.",
};

export default function MonthlyPage() {
  return (
    <>
      <PageHeader
        description="How last month compared with normal."
        title="Monthly climate summary"
      />
      <PlaceholderNotice product="The monthly summary" />
    </>
  );
}
