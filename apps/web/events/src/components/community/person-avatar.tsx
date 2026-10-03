import { Avatar, AvatarFallback } from "@barrelsgd/ui/components/ui/avatar";
import { cn } from "@barrelsgd/ui/lib/utils";
import { initials } from "@/domain/labels";

/** Initials avatar; profile photos arrive with uploads. */
export function PersonAvatar({
  className,
  name,
  size = "default",
}: {
  className?: string;
  name: string;
  size?: "default" | "sm" | "lg";
}) {
  return (
    <Avatar className={className} size={size}>
      <AvatarFallback
        className={cn("bg-events-ink font-semibold text-events-lime")}
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
            className="ring-2 ring-card"
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
