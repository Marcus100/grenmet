import {
  BULLETIN_CATEGORIES,
  isBulletin,
  isProductKind,
} from "@barrelsgd/gms/products";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { AlertGroups } from "@/components/pages/alert-groups";
import { ExerciseBanner } from "@/components/pages/exercise-banner";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PublishedProducts } from "@/components/pages/published-products";
import { BULLETIN_GUIDANCE } from "@/lib/bulletins";
import { fetchActiveAlerts } from "@/lib/cap";
import { PREPARE_PAGE } from "@/lib/hazard-pages";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ hazard: string }>;
}) {
  const { hazard } = await params;
  return {
    title:
      Object.entries(BULLETIN_CATEGORIES).find(
        ([key]) => key === hazard
      )?.[1] ?? "Bulletins",
  };
}
export default async function BulletinPage({
  params,
}: {
  params: Promise<{ hazard: string }>;
}) {
  const { hazard } = await params;
  if (
    !(
      isProductKind(hazard) &&
      isBulletin(hazard) &&
      hazard in BULLETIN_GUIDANCE
    )
  )
    notFound();
  const category = hazard as keyof typeof BULLETIN_CATEGORIES;
  const alerts = await fetchActiveAlerts();
  const prepare = PREPARE_PAGE[category];
  return (
    <div className="space-y-6">
      <PageHeader
        description={BULLETIN_GUIDANCE[category]}
        title={`${BULLETIN_CATEGORIES[category]} alerts and warnings`}
      />
      <ExerciseBanner result={alerts} />
      <PageSection heading="Warnings in effect (yellow, orange and red)">
        <AlertGroups
          emptyLabel={`No ${BULLETIN_CATEGORIES[category].toLowerCase()} warning is in effect for Grenada, Carriacou or Petite Martinique.`}
          only={[BULLETIN_CATEGORIES[category]]}
          result={alerts}
        />
      </PageSection>
      <PublishedProducts kinds={[category]} />
      {category === "marine" ? (
        <PageSection heading="Marine advisory thresholds">
          <InfoTable
            caption="Thresholds used by the Grenada Meteorological Service"
            headers={["Product", "Seas", "Wind"]}
            rows={[
              ["Small Craft Advisory", "2.0 m and above", "20 kt and above"],
              ["High Surf Advisory", "2.5 m breaking surf", "Any"],
              ["Gale Warning", "Any", "34 kt and above"],
              ["Storm Warning", "Any", "48 kt and above"],
            ]}
          />
        </PageSection>
      ) : null}
      <section className="rounded-gm-card border-gm-border bg-gm-surface text-body-base leading-body-base max-w-prose space-y-3 border p-5">
        <h2 className="font-gm-display text-gm-heading text-heading-md leading-heading-md font-bold">
          Reading an alert
        </h2>
        <p>
          Check the issue time, area covered and validity first. Read the
          expected impacts and recommended response together. A later issue may
          change the earlier assessment.
        </p>
        <p>
          Yellow, orange and red notices are warnings, issued through CAP. The
          green-level products issued by GMS are called GMS alerts. This page
          shows both for this hazard.
        </p>
        <Link
          className="text-gm-blue-ink font-semibold underline"
          href="/alerts"
        >
          View all alerts in effect
        </Link>
        {prepare ? (
          <Link
            className="text-gm-blue-ink block font-semibold underline"
            href={prepare.href}
          >
            {prepare.label}
          </Link>
        ) : null}
      </section>
      <nav aria-label="Hazards" className="flex flex-wrap gap-3">
        {Object.entries(BULLETIN_CATEGORIES).map(([key, label]) => (
          <Link
            className="hover:bg-muted rounded-lg border px-3 py-2"
            href={`/alerts/bulletins/${key}`}
            key={key}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
