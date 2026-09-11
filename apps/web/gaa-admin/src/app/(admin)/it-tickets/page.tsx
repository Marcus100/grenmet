import { OperationsHub } from "@/components/operations/operations-hub";
export const metadata = { title: "IT support" };
export default function ItSupportPage() {
  return (
    <OperationsHub
      description="Prepare a clear incident report for your designated IT contact. This page does not submit a ticket to an external system."
      sections={[
        {
          title: "What to record",
          body: "Include the affected service and page URL, date and time, expected result, actual result, reproducible steps, and the number of people affected. Describe the operational impact and any workaround.",
          links: [{ label: "Find your IT contact in Staff", href: "/users" }],
        },
        {
          title: "Access or sign-in trouble",
          body: "Record whether the issue occurs locally, in staging or in production. Note the hostname shown after sign-in or logout. Do not include passwords, cookies or access tokens in a report.",
          links: [
            { label: "Your profile", href: "/profile" },
            { label: "Operations resources", href: "/resources" },
          ],
        },
        {
          title: "Weather product issue",
          body: "Include the product type, issue date, revision, whether it was a draft or publication, and the exact error shown. Keep the source report available for comparison.",
          links: [
            { label: "Forecast desk", href: "/wxproducts/fcsts" },
            { label: "wxRegister", href: "/wxproducts/hourly" },
          ],
        },
      ]}
      title="IT support"
    />
  );
}
