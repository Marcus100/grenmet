import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { DateNavigation } from "@/components/wxwatch/date-navigation";
import { Gallery } from "@/components/wxwatch/gallery";
import { getImagesByDateAndSynoptic } from "@/db/wxwatch/queries";
import { parseDateFromUrl } from "@/lib/wxwatch/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "WxWatch",
  description:
    "Satellite and model imagery collected at synoptic hours, by UTC day.",
};

interface PageProps {
  params: Promise<{
    year: string;
    month: string;
    day: string;
  }>;
}

export default async function DatePage({ params }: PageProps) {
  noStore();

  const { year, month, day } = await params;
  const date = parseDateFromUrl(year, month, day);

  if (!date) {
    notFound();
  }

  const images = await getImagesByDateAndSynoptic(date);

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <div className="space-y-2">
            <Link className="text-sm underline" href="/wxwatch/archive">
              Browse all editions
            </Link>
            <DateNavigation currentDate={date} />
          </div>
        }
        description={
          <>
            {date.toLocaleDateString("en-GB", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}{" "}
            UTC — imagery at the eight synoptic hours.
          </>
        }
        title="WxWatch"
      />

      <Gallery imagesBySynoptic={images} />
    </div>
  );
}
