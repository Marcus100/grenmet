import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { DateNavigation } from "@/components/DateNavigation";
import { Gallery } from "@/components/Gallery";
import { getImagesByDateAndSynoptic } from "@/db/queries";
import { parseDateFromUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD format

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-bold text-2xl text-gray-900">
                Weather Image Gallery
              </h1>
              <p className="mt-1 text-gray-500 text-sm">
                {date.toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  timeZone: "UTC",
                })}{" "}
                UTC
              </p>
            </div>
            <DateNavigation currentDate={date} />
          </div>
        </div>
      </header>

      {/* Gallery */}
      <div className="mx-auto max-w-full p-6">
        {images.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center text-gray-500">
            <svg
              className="mb-4 h-16 w-16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M4 16l4.586-4.586a2 0 012.828 0L16 16m-2-2l1.586-1.586a2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 0 002-2V6a2 0 00-2-2H6a2 0 002 2v12a2 0 002 2z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
              />
            </svg>
            <p className="text-lg">No images found for this date</p>
            <p className="mt-1 text-sm">Try selecting a different date</p>
          </div>
        ) : (
          <Gallery imagesBySynoptic={images} />
        )}
      </div>
    </main>
  );
}
