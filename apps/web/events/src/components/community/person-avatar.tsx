import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@barrelsgd/ui/components/ui/avatar";
import { cn } from "@barrelsgd/ui/lib/utils";
import { initials } from "@/domain/labels";
import { storedImageUrl } from "@/lib/stored-image";

/** Initials avatar; profile photos arrive with uploads. */
export function PersonAvatar({
  className,
  imageFileId,
  name,
  size = "default",
}: {
  className?: string;
  /** A stored public image (an organiser logo); initials show until it loads or if it fails. */
  imageFileId?: string | null;
  name: string;
  size?: "default" | "sm" | "lg";
}) {
  return (
    <Avatar className={className} size={size}>
      {imageFileId ? (
        <AvatarImage
          alt={`${name} logo`}
          className="object-cover"
          loading="lazy"
          src={storedImageUrl(imageFileId)}
        />
      ) : null}
      <AvatarFallback
        className={cn("bg-events-ink text-events-lime font-semibold")}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function GoingAvatars({
  names,
  total,
}: {
  names: readonly string[];
  total: number;
}) {
  if (total === 0) {
    return (
      <p className="text-caption text-muted-foreground">Be the first to go</p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {names.slice(0, 4).map((name) => (
          <PersonAvatar
            className="ring-card ring-2"
            key={name}
            name={name}
            size="sm"
          />
        ))}
      </div>
      <p className="text-caption text-muted-foreground">{total} going</p>
    </div>
  );
}
