"use client";

import Image from "next/image";
import { useState } from "react";
import { Lightbox } from "@/components/wxwatch/lightbox";
import type { WeatherImage } from "@/db/wxwatch/schema";
import { getImageUrl } from "@/lib/wxwatch/utils";

/** Horizontally scrolling strip of the newest frames; clicking one opens the
 *  same lightbox the WxWatch gallery uses. */
export function ImageryStrip({ images }: { images: WeatherImage[] }) {
  const [selected, setSelected] = useState<WeatherImage | null>(null);

  return (
    <>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {images.map((image) => {
          const url = getImageUrl(image.storagePath);
          return (
            <button
              className="group relative aspect-4/3 w-40 shrink-0 overflow-hidden rounded-lg border bg-muted outline-none transition-all hover:ring-2 hover:ring-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              key={image.id}
              onClick={() => setSelected(image)}
              type="button"
            >
              <Image
                alt={image.name || "Weather image"}
                className="object-cover transition-transform duration-200 group-hover:scale-105"
                fill
                sizes="160px"
                src={url}
                unoptimized={
                  image.fileFormat === "gif" || url.startsWith("/api/")
                }
              />
              <span className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/70 to-transparent p-1.5 text-left text-white text-xs">
                {image.spiderName?.replace(/_/g, " ") ?? "Source"}
              </span>
            </button>
          );
        })}
      </div>
      <Lightbox image={selected} onClose={() => setSelected(null)} />
    </>
  );
}
