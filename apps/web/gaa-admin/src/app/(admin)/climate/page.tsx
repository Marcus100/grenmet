import { OperationsHub } from "@/components/operations/operations-hub";
export const metadata = { title: "Climate & Data" };
export default function ClimatePage() {
  return (
    <OperationsHub
      description="Prepare observational records and coordinate climate-data requests. Keep station, period, units and quality-control notes with every extract."
      sections={[
        {
          title: "Observation records",
          body: "Start with the hourly station register. Identify missing values, corrections and the observation time basis before aggregating a period.",
          links: [
            { label: "Open wxRegister", href: "/wxproducts/hourly" },
            { label: "View weather imagery", href: "/wxwatch" },
          ],
        },
        {
          title: "Data request checklist",
          body: "Record the requesting organization, intended use, station or area, start and end dates, elements required, time resolution and delivery format. Confirm any release conditions before supplying the extract.",
          links: [
            { label: "Find responsible staff", href: "/users" },
            { label: "Plan the work", href: "/calendar" },
          ],
        },
        {
          title: "Forecast context",
          body: "An issued forecast describes expected conditions. Keep it distinct from measured station data and long-term climate statistics.",
          links: [
            { label: "Impact-Based Forecasts", href: "/wxproducts/fcsts" },
            { label: "Tropical Weather Outlook", href: "/wxproducts/nhc" },
          ],
        },
      ]}
      title="Climate & Data"
    />
  );
}
