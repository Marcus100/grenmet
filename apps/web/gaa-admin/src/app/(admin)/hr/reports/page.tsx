import { OperationsHub } from "@/components/operations/operations-hub";
export const metadata = { title: "HR reports" };
export default function HrReportsPage() {
  return (
    <OperationsHub
      description="Review the live records behind staffing and leave reports. Use the relevant register as the source rather than treating dashboard summaries as a complete export."
      sections={[
        {
          title: "Staffing and attendance",
          body: "Review roster assignments by date and department. Confirm changes, absences and shift coverage before preparing attendance summaries.",
          links: [
            { label: "Duty roster", href: "/roster" },
            { label: "Staff records", href: "/users" },
          ],
        },
        {
          title: "Leave and requests",
          body: "Use the HR dashboard to review submitted requests and approval status. Keep the reporting period and inclusion criteria with any summary.",
          links: [
            { label: "HR dashboard", href: "/hr" },
            { label: "HR setup", href: "/hr-setup" },
          ],
        },
      ]}
      title="HR reports"
    />
  );
}
