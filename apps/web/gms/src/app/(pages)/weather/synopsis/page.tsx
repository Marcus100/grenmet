import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import { Provenance } from "@/components/pages/provenance";
import { UnavailableNotice } from "@/components/pages/unavailable-notice";
import { fetchPublishedProducts } from "@/lib/products";
import { latestSynopsis } from "@/lib/weather-pages";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Weather synopsis",
  description:
    "The duty forecaster's plain-language summary of the pattern over Grenada.",
};

export default async function SynopsisPage() {
  const result = await fetchPublishedProducts();
  const synopsis =
    result.status === "ok" ? latestSynopsis(result.products) : null;
  return (
    <>
      <PageHeader
        description="The forecaster's plain-language summary."
        title="Weather synopsis"
      />
      {result.status === "unavailable" && (
        <UnavailableNotice product="The weather synopsis" />
      )}
      {result.status === "ok" && !synopsis && (
        <p
          className="rounded-gm-card border-gm-border text-body-base leading-body-base border p-4"
          role="status"
        >
          No forecast narrative is currently published. Check back after the
          next forecast issue.
        </p>
      )}
      {synopsis && (
        <>
          <PageSection heading="Current situation">
            <Provenance
              kind="forecast"
              source={`GMS ${synopsis.kindLabel}`}
              status="verified"
              time={synopsis.issuedAt}
            />
            <Prose paragraphs={synopsis.paragraphs} />
            <p className="text-body-sm text-gm-text-secondary leading-body-sm mt-4 font-mono">
              From the{" "}
              <Link
                className="hover:text-gm-blue-ink underline underline-offset-4"
                href={`/weather/issued/${synopsis.id}`}
              >
                {synopsis.kindLabel}
              </Link>{" "}
              issued {synopsis.issuedAt.replace("T", " ")} (Grenada time)
            </p>
          </PageSection>
          {synopsis.watch.length > 0 && (
            <PageSection heading="What to watch">
              <Prose paragraphs={synopsis.watch} />
            </PageSection>
          )}
        </>
      )}
    </>
  );
}
