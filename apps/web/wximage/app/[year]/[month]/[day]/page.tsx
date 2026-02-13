import { unstable_noStore as noStore } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { getImagesByDateAndSynoptic } from '@/db/queries';
import { Gallery } from '@/components/Gallery';
import { DateNavigation } from '@/components/DateNavigation';
import { parseDateFromUrl, formatDateForUrl, getTodayUTC } from '@/lib/utils';

export const dynamic = 'force-dynamic';
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

  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Weather Image Gallery</h1>
              <p className="text-sm text-gray-500 mt-1">
                {date.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  timeZone: 'UTC',
                })} UTC
              </p>
            </div>
            <DateNavigation currentDate={date} />
          </div>
        </div>
      </header>

      {/* Gallery */}
      <div className="max-w-full mx-auto p-6">
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500">
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 0 012.828 0L16 16m-2-2l1.586-1.586a2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 0 002-2V6a2 0 00-2-2H6a2 0 002 2v12a2 0 002 2z" />
            </svg>
            <p className="text-lg">No images found for this date</p>
            <p className="text-sm mt-1">Try selecting a different date</p>
          </div>
        ) : (
          <Gallery imagesBySynoptic={images} />
        )}
      </div>
    </main>
  );
}

