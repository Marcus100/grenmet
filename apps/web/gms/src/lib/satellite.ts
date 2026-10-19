import "server-only";
import {
  type PublicSatelliteImage,
  publicSatelliteLatestSchema,
} from "@barrelsgd/api-client";
import { endpoint } from "@/lib/products";
import { reportError } from "@/lib/report-error";

export type SatelliteResult =
  | { status: "ok"; images: PublicSatelliteImage[] }
  | { status: "unavailable"; images: [] };

/** Images shown on the page; the API already returns the newest per product. */
export const MAX_SATELLITE_IMAGES = 6;

/** Latest GOES images from FastAPI. "unavailable" is never presented as "none". */
export async function fetchSatelliteLatest(): Promise<SatelliteResult> {
  try {
    const response = await fetch(endpoint("latest", "wxwatch"), {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { status: "unavailable", images: [] };
    const parsed = publicSatelliteLatestSchema.safeParse(await response.json());
    if (!parsed.success) {
      reportError(parsed.error, "gms-satellite-contract");
      return { status: "unavailable", images: [] };
    }
    return {
      status: "ok",
      images: parsed.data.images.slice(0, MAX_SATELLITE_IMAGES),
    };
  } catch (error) {
    reportError(error, "gms-satellite");
    return { status: "unavailable", images: [] };
  }
}

/** The site's own URL for an image, so the browser never needs the API host. */
export function satelliteImageSrc(image: Pick<PublicSatelliteImage, "id">) {
  return `/api/satellite/${image.id}`;
}
