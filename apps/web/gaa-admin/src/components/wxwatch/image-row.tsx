"use client";

import Image from "next/image";
import type { WeatherImage } from "@/db/wxwatch/schema";
import { getImageUrl } from "@/lib/wxwatch/utils";

interface ImageRowProps {
  onImageClick: (image: WeatherImage) => void;
  synopticImages: {
    "00": WeatherImage | null;
    "03": WeatherImage | null;
    "06": WeatherImage | null;
    "09": WeatherImage | null;
    "12": WeatherImage | null;
    "15": WeatherImage | null;
    "18": WeatherImage | null;
    "21": WeatherImage | null;
  };
  title: string;
}

const SYNOPTIC_HOURS: Array<
  "00" | "03" | "06" | "09" | "12" | "15" | "18" | "21"
> = ["00", "03", "06", "09", "12", "15", "18", "21"];

export function ImageRow({
  title,
  synopticImages,
  onImageClick,
}: ImageRowProps) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="truncate font-semibold text-foreground text-sm">
          {title}
        </h2>
      </div>

      {/* One slot per synoptic hour */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {SYNOPTIC_HOURS.map((hour) => (
          <SynopticImageSlot
            hour={hour}
            image={synopticImages[hour]}
            key={hour}
            onImageClick={onImageClick}
          />
        ))}
      </div>
    </section>
  );
}

interface SynopticImageSlotProps {
  hour: string;
  image: WeatherImage | null;
  onImageClick: (image: WeatherImage) => void;
}

function SynopticImageSlot({
  hour,
  image,
  onImageClick,
}: SynopticImageSlotProps) {
  if (!image) {
    return (
      <div className="flex aspect-4/3 flex-col items-center justify-center rounded-lg border border-border border-dashed bg-muted/40 text-center">
        <p className="font-medium text-muted-foreground text-xs">{hour}z</p>
        <p className="text-muted-foreground text-xs">No image</p>
      </div>
    );
  }

  const imageUrl = getImageUrl(image.storagePath);

  const observationTime = image.observationTime
    ? `${new Date(image.observationTime).toLocaleString("en-GB", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
        hour12: false,
      })} UTC`
    : "Unknown";

  return (
    <button
      className="group relative aspect-4/3 overflow-hidden rounded-lg border bg-muted outline-none transition-all duration-200 hover:ring-2 hover:ring-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      onClick={() => onImageClick(image)}
      type="button"
    >
      <Image
        alt={image.name || `Weather image at ${hour}z`}
        className="object-cover transition-transform duration-200 group-hover:scale-105"
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 12.5vw"
        src={imageUrl}
        unoptimized={image.fileFormat === "gif" || imageUrl.startsWith("/api/")}
      />
      {/* Time label overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-2 text-left">
        <p className="font-medium text-white text-xs">{hour}z</p>
        <p className="text-micro text-white leading-micro opacity-90">
          {observationTime}
        </p>
      </div>
    </button>
  );
}
