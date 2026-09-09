"use client";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import type { ImagesBySynoptic } from "@/db/wxwatch/queries";
import type { WeatherImage } from "@/db/wxwatch/schema";
import { ImageRow } from "./image-row";
import { Lightbox } from "./lightbox";

interface GalleryProps {
  imagesBySynoptic: ImagesBySynoptic;
}

export function Gallery({ imagesBySynoptic }: GalleryProps) {
  const [selectedImage, setSelectedImage] = useState<WeatherImage | null>(null);

  if (imagesBySynoptic.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ImageOff />
          </EmptyMedia>
          <EmptyTitle>No images for this date</EmptyTitle>
          <EmptyDescription>
            Pick another date, or run the scrapers to fetch weather images.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {imagesBySynoptic.map((group) => (
          <ImageRow
            key={group.name}
            onImageClick={setSelectedImage}
            synopticImages={group.synopticImages}
            title={group.name}
          />
        ))}
      </div>

      <Lightbox image={selectedImage} onClose={() => setSelectedImage(null)} />
    </>
  );
}
