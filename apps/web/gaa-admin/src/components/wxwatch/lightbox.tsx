"use client";

import type { WeatherImage } from "@barrelsgd/api-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@barrelsgd/ui/components/ui/dialog";
import Image from "next/image";
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
  const basis = image.timeBasis ?? "legacy_unknown";
  const timeLabels: Record<string, string> = {
    filename: "Observation time (from filename)",
    source_observation: "Observation time (source reported)",
    estimated_analysis: "Estimated analysis time",
    rounded_source_modified: "Estimated time (rounded source modification)",
    source_modified: "Source modification time",
  };
  const timeLabel = timeLabels[basis] ?? "Nominal time (unverified)";
  const productTime =
    image.archiveObservedAt ??
    image.archiveNominalTime ??
    image.observationTime;
  const verification = verificationLabel(image);

  return (
    <DialogContent className="flex h-[92dvh] w-[96vw] max-w-none flex-col overflow-hidden sm:max-w-none">
      <DialogHeader>
        <DialogTitle className="truncate pr-8">
          {image.name || "Untitled"}
        </DialogTitle>
        <DialogDescription>
          {image.spiderName?.replace(/_/g, " ") ?? "Unknown source"}
        </DialogDescription>
      </DialogHeader>

      <div className="relative min-h-0 flex-1 rounded-lg bg-muted">
        <Image
          alt={image.name || "Weather image"}
          className="rounded-md object-contain"
          fill
          priority
          sizes="96vw"
          src={imageUrl}
          unoptimized={
            image.fileFormat === "gif" || imageUrl.startsWith("/_backend/")
          }
        />
      </div>

      <div className="max-h-64 shrink-0 overflow-y-auto">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <MetaItem label={timeLabel} value={formatUtc(productTime)} />
          <MetaItem
            label="First retrieved"
            value={formatUtc(image.firstRetrievedAt ?? image.fetchedAt)}
          />
          <MetaItem
            label="Latest recorded retrieval"
            value={formatUtc(image.latestRetrievedAt)}
          />
        </dl>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm">
            File details · {verification}
          </summary>
          <dl className="mt-3 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <MetaItem
              label="Dimensions"
              value={`${image.width || "?"} × ${image.height || "?"}`}
            />
            <MetaItem
              label="Format"
              value={(image.fileFormat || "Unknown").toUpperCase()}
            />
            <MetaItem
              label="Verified size"
              value={
                image.verifiedByteSize == null
                  ? "Unknown"
                  : `${image.verifiedByteSize.toLocaleString("en-GB")} bytes`
              }
            />
            <MetaItem
              label="Frames"
              value={
                image.isAnimated
                  ? `Animated (${image.frameCount || "?"})`
                  : "Still image"
              }
            />
            <div className="col-span-2 break-all md:col-span-4">
              <MetaItem
                label="SHA-256 (catalogued asset)"
                value={image.verifiedSha256 ?? "Unknown"}
              />
            </div>
          </dl>
        </details>
      </div>
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

function formatUtc(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC", hour12: false })} UTC`;
}

function verificationLabel(image: WeatherImage): string {
  if (image.replicaState === "missing" || image.replicaState === "failed") {
    return "Local file unavailable or failed verification";
  }
  if (
    image.verificationStatus === "verified" &&
    image.replicaState === "verified"
  ) {
    return "Verified local file";
  }
  if (image.verificationStatus === "unverified") {
    return "Historical checksum unavailable";
  }
  return image.verificationStatus
    ? `File status: ${image.verificationStatus}`
    : "Not verified";
}
