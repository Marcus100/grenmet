import type { PublicSatelliteImage } from "@barrelsgd/api-client";
import Image from "next/image";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Provenance } from "@/components/pages/provenance";
import { UnavailableNotice } from "@/components/pages/unavailable-notice";

/**
 * The latest GOES images with source, time and a 30-minute stale flag. No
 * image yet is the honest "not yet available" notice; an unreachable feed
 * says so instead (never an empty gallery).
 */
export function SatelliteImages({
  images,
  now,
  status,
}: {
  images: PublicSatelliteImage[];
  now?: Date;
  status: "ok" | "unavailable";
}) {
  if (status === "unavailable")
    return <UnavailableNotice product="Satellite imagery" />;
  if (images.length === 0)
    return <PlaceholderNotice product="Satellite imagery" />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {images.map((image) => (
        <figure className="flex flex-col gap-2" key={image.id}>
          <Image
            alt={`Satellite view: ${image.title}`}
            className="rounded-gm-card border-gm-border h-auto w-full border"
            height={image.height ?? 600}
            src={`/api/satellite/${image.id}`}
            unoptimized
            width={image.width ?? 800}
          />
          <figcaption className="text-body-sm text-gm-heading leading-body-sm font-semibold">
            {image.title}
          </figcaption>
          <Provenance
            kind="satellite"
            now={now}
            source={`${image.source} (${image.attribution})`}
            status="external"
            time={image.observed_at}
          />
        </figure>
      ))}
    </div>
  );
}
