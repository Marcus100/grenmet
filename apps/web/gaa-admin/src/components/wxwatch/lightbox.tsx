"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@barrelsgd/ui/components/ui/dialog";
import Image from "next/image";
import type { WeatherImage } from "@/db/wxwatch/schema";
import { getImageUrl } from "@/lib/wxwatch/utils";

interface LightboxProps {
  image: WeatherImage | null;
  onClose: () => void;
}

export function Lightbox({ image, onClose }: LightboxProps) {
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={image !== null}
    >
      {image ? <LightboxContent image={image} /> : null}
    </Dialog>
  );
}

function LightboxContent({ image }: { image: WeatherImage }) {
  const imageUrl = getImageUrl(image.storagePath);
  const fetchedDate = image.fetchedAt
    ? new Date(image.fetchedAt).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        hour12: false,
      })
    : "Unknown";

  return (
    <DialogContent className="max-h-[90vh] max-w-[min(90rem,95vw)] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="truncate pr-8">
          {image.name || "Untitled"}
        </DialogTitle>
        <DialogDescription>
          {image.spiderName?.replace(/_/g, " ") ?? "Unknown source"}
        </DialogDescription>
      </DialogHeader>

      <div className="flex justify-center rounded-lg bg-muted p-2">
        <Image
          alt={image.name || "Weather image"}
          className="max-h-[65vh] w-auto rounded-md object-contain"
          height={image.height || 600}
          priority
          src={imageUrl}
          unoptimized={
            image.fileFormat === "gif" || imageUrl.startsWith("/api/")
          }
          width={image.width || 800}
        />
      </div>

      <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <MetaItem
          label="Dimensions"
          value={`${image.width || "?"} × ${image.height || "?"}`}
        />
        <MetaItem
          label="Format"
          value={(image.fileFormat || "Unknown").toUpperCase()}
        />
        <MetaItem label="Fetched" value={`${fetchedDate} UTC`} />
        <MetaItem
          label="Frames"
          value={
            image.isAnimated
              ? `Animated (${image.frameCount || "?"})`
              : "Still image"
          }
        />
      </dl>
    </DialogContent>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
