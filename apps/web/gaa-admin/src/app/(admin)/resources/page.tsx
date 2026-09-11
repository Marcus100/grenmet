import { OperationsHub } from "@/components/operations/operations-hub";
export const metadata = { title: "Resources" };
export default function ResourcesPage() {
  return (
    <OperationsHub
      description="A practical starting point for the forecast desk, observation shift and daily administration."
      sections={[
        {
          title: "Daily issue schedule",
          body: "Impact-Based Forecasts: 07:00, 12:00, 18:00. Marine: 05:00. Tropical Weather Outlook: 02:00, 08:00, 14:00, 20:00. These times are Grenada local time.",
          links: [
            { label: "Forecast desk", href: "/wxproducts/fcsts" },
            { label: "Bulletins", href: "/wxproducts/bulletins" },
            { label: "NHC Products", href: "/wxproducts/nhc" },
          ],
        },
        {
          title: "Observations and aviation",
          body: "METAR and SYNOP observations are hourly, on the hour. TAF schedule supplied: 00:00, 06:00, 12:00, 18:00. Confirm the aviation schedule time basis before operational use.",
          links: [
            { label: "wxRegister", href: "/wxproducts/hourly" },
            { label: "TAF / METAR Composer", href: "/wxproducts/aviation" },
          ],
        },
        {
          title: "Before publication",
          body: "Check issue time, validity, area, units, expected impacts and response. Save a draft, review its preview, and record a revision note when updating an earlier issue.",
          links: [
            { label: "CAP Composer", href: "/cap" },
            { label: "Duty roster", href: "/roster" },
          ],
        },
        {
          title: "People and support",
          body: "Use the staff directory to identify the responsible officer. Keep a concise record of technical issues, including the page, time and steps needed to reproduce the problem.",
          links: [
            { label: "Staff directory", href: "/users" },
            { label: "IT support", href: "/it-tickets" },
          ],
        },
      ]}
      title="Operations resources"
    />
  );
}
