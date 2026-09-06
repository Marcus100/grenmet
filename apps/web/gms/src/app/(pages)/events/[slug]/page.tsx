import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";
import { EVENT_FORECASTS, findEvent } from "@/lib/events";

export function generateStaticParams() {
  return EVENT_FORECASTS.map((event) => ({ slug: event.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = findEvent(slug);
  return event
    ? { title: `${event.name} forecast`, description: event.description }
    : { title: "Event forecast" };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = findEvent(slug);

  if (!event) {
    notFound();
  }

  return (
    <>
      <PageHeader
        description={`${event.venue} · ${event.period}`}
        title={`${event.name} forecast`}
      />
      <PlaceholderNotice product={`The ${event.name} forecast`} />
      <PageSection heading="About this event">
        <Prose paragraphs={[event.description]} />
      </PageSection>
      <PageSection heading="Weather sensitivities">
        <Checklist items={event.sensitivities} />
      </PageSection>
      <PageSection heading="Decision thresholds">
        <InfoTable
          caption="Agreed with the organiser — the forecast is written against these"
          headers={["If this happens", "The organiser"]}
          rows={event.thresholds.map((threshold) => [
            threshold.condition,
            threshold.action,
          ])}
        />
      </PageSection>
      <PageSection heading="Typical conditions for the period">
        <Prose paragraphs={event.outlook} />
      </PageSection>
    </>
  );
}
