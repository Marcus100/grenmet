import { notFound } from "next/navigation";
import { WeatherSurface } from "@/components/home/weather-surface";
import { locationBySlug, prefixedLocationParams } from "@/lib/locations";

/**
 * Today for a non-default place, e.g. `/carriacou`. Only enabled places are
 * generated; any other slug is a 404 (and real routes always win).
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return prefixedLocationParams();
}

type Params = Promise<{ location: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const place = locationBySlug((await params).location);
  return { title: place ? `${place.name} weather` : "Weather" };
}

export default async function LocationHomePage({ params }: { params: Params }) {
  const place = locationBySlug((await params).location);
  if (!place || place.isDefault) {
    notFound();
  }
  return (
    <div className="pb-12">
      <WeatherSurface location={place} />
    </div>
  );
}
