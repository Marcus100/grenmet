import {
  grenadaDate,
  LEGACY_CLIMATE_FIELDS,
  nextClimateIssue,
  presentationFields,
} from "@barrelsgd/gms/products";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ClimateFigures } from "@/components/pages/climate-figures";
import { fetchPublishedProducts } from "@/lib/products";

export const metadata = {
  title: "Monthly Climate Bulletin",
  description:
    "The Grenada Meteorological Service's monthly Climate Bulletin, issued on the 15th for the previous month.",
};
export const dynamic = "force-dynamic";

/** The bulletin's headline narrative; the full tables are on the issued bulletin page. */
const NARRATIVE = new Set([
  "enso",
  "sst",
  "precipOutlook",
  "tempMeanOutlook",
  "droughtOutlook",
  "generalImplications",
]);

function monthName(month: string) {
  const time = Date.parse(`${month}-01T12:00:00Z`);
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(time)
    : month;
}

export default async function MonthlyPage() {
  const result = await fetchPublishedProducts("climate-bulletin");
  const bulletin =
    result.status === "ok"
      ? [...result.products]
          .filter((product) => product.kind === "climate-bulletin")
          .sort((a, b) =>
            (b.values.issuedAt ?? "").localeCompare(a.values.issuedAt ?? "")
          )[0]
      : undefined;
  const month = bulletin?.values.month ?? "";
  // Revisions saved before the owner's bulletin layout carry the first-version
  // text fields; show them too so such an issue is not an empty page.
  const fields = [
    ...presentationFields("climate-bulletin").filter((field) =>
      NARRATIVE.has(field.key)
    ),
    ...LEGACY_CLIMATE_FIELDS,
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        description="Issued on the 15th of each month for the previous month."
        title="Monthly Climate Bulletin"
      />
      {result.status === "unavailable" ? (
        <p
          className="rounded-gm-card border-gm-border border p-4"
          role="status"
        >
          The Climate Bulletin cannot be retrieved right now.
        </p>
      ) : null}
      {result.status === "ok" && !bulletin ? (
        <p className="text-body-base text-gm-text-secondary leading-body-base">
          No Climate Bulletin is in force right now. Earlier bulletins stop
          appearing here when the next monthly issue is due; the next issue is
          expected on {nextClimateIssue(grenadaDate())}.
        </p>
      ) : null}
      {bulletin ? (
        <article className="space-y-4">
          <h2 className="font-gm-display text-gm-heading text-heading-md leading-heading-md font-bold">
            {monthName(month)}
          </h2>
          {fields.map((field) =>
            bulletin.values[field.key] ? (
              <section className="space-y-1" key={field.key}>
                <h3 className="text-gm-heading font-semibold">{field.label}</h3>
                <p className="whitespace-pre-line">
                  {bulletin.values[field.key]}
                </p>
              </section>
            ) : null
          )}
          <ClimateFigures month={month} />
          <p className="text-body-sm text-gm-text-secondary leading-body-sm">
            <Link
              className="underline underline-offset-4"
              href={`/weather/issued/${bulletin.id}`}
            >
              Full issued bulletin
            </Link>{" "}
            · Revision {bulletin.revision}
          </p>
        </article>
      ) : null}
    </div>
  );
}
