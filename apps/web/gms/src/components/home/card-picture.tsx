import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import { isOptimizableImage } from "@/lib/cms";
import type { CardPicture } from "@/lib/desk-feed";
import { cn } from "@/lib/utils";

const AREA = "relative aspect-[16/9] overflow-hidden rounded-lg";

/**
 * A card's picture with its credit line under it, always. Without a picture the
 * area stays, saying "No picture yet", so a card never changes shape when a
 * picture is missing.
 */
export function CardPictureArea({
  icon: Icon,
  picture,
}: {
  /** Decorative icon shown in the empty area. */
  icon?: LucideIcon;
  picture: CardPicture | null;
}) {
  if (!picture) {
    return (
      <div
        className={cn(
          AREA,
          "bg-gm-surface-panel text-body-sm text-gm-text-secondary leading-body-sm flex flex-col items-center justify-center gap-2"
        )}
      >
        {Icon && (
          <Icon
            aria-hidden="true"
            className="text-gm-sky-ink size-10"
            strokeWidth={1.5}
          />
        )}
        <p>No picture yet</p>
      </div>
    );
  }
  return (
    <figure className="flex flex-col gap-1">
      <span className={cn(AREA, "bg-gm-surface-panel")}>
        <Image
          alt={picture.alt}
          className="object-cover"
          fill
          sizes="(min-width: 640px) 24rem, 85vw"
          src={picture.src}
          unoptimized={!isOptimizableImage(picture.src)}
        />
      </span>
      <figcaption className="text-caption text-gm-text-muted leading-caption">
        {picture.credit}
      </figcaption>
    </figure>
  );
}
