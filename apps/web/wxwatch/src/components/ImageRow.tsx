"use client";

import Image from "next/image";
import type { WeatherImage } from "@/db/schema";
import { getImageUrl } from "../../lib/utils";

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
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between px-4">
        <h2 className="font-semibold text-gray-800 text-lg">{title}</h2>
      </div>

      {/* 8-image grid */}
      <div className="grid grid-cols-8 gap-3 px-4">
        {SYNOPTIC_HOURS.map((hour) => {
          const image = synopticImages[hour];
          return (
            <SynopticImageSlot
              hour={hour}
              image={image}
              key={hour}
              onImageClick={onImageClick}
            />
          );
        })}
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
      <div className="relative flex aspect-[4/3] items-center justify-center rounded-lg border-2 border-gray-300 border-dashed bg-gray-200">
        <div className="text-center">
          <p className="mb-1 font-medium text-gray-400 text-xs">{hour}z</p>
          <p className="text-gray-400 text-xs">No image</p>
        </div>
      </div>
    );
  }

  const imageUrl = getImageUrl(image.storagePath);

  const observationTime = image.observationTime
    ? `${new Date(image.observationTime).toLocaleString("en-US", {
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
      className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-100 transition-all duration-200 hover:ring-2 hover:ring-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      onClick={() => onImageClick(image)}
      type="button"
    >
      <Image
        alt={image.name || `Weather image at ${hour}z`}
        className="object-cover transition-transform duration-200 group-hover:scale-105"
        fill
        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 12.5vw"
        src={imageUrl}
        unoptimized={image.fileFormat === "gif"}
      />
      {/* Time label overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        <p className="font-medium text-white text-xs">{hour}z</p>
        <p className="text-[10px] text-white opacity-90">{observationTime}</p>
      </div>
    </button>
  );
}
