import {
  BULLETIN_CATEGORIES,
  isBulletin,
  isProductKind,
} from "@barrelsgd/gms/products";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PublishedProducts } from "@/components/pages/published-products";
import { BULLETIN_GUIDANCE } from "@/lib/bulletins";
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
  return (
    <div className="space-y-6">
      <PageHeader
        description={BULLETIN_GUIDANCE[category]}
        title={`${BULLETIN_CATEGORIES[category]} bulletins`}
      />
      <PublishedProducts kinds={[category]} />
      <section className="space-y-3 rounded-lg border bg-card p-5">
        <h2 className="font-semibold text-xl">Reading a bulletin</h2>
        <p>
          Check the issue time, area covered and validity first. Read the
          expected impacts and recommended response together. A later issue may
          change the earlier assessment.
        </p>
        <p>
          The hazard count in Current alerts comes from CAP. These bulletin
          pages are maintained separately while the product formats are
          developed.
        </p>
        <Link className="underline" href="/warnings">
          View current CAP alerts
        </Link>
      </section>
      <nav aria-label="Bulletin categories" className="flex flex-wrap gap-3">
        {Object.entries(BULLETIN_CATEGORIES).map(([key, label]) => (
          <Link
            className="rounded-lg border px-3 py-2 hover:bg-muted"
            href={`/bulletins/${key}`}
            key={key}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
