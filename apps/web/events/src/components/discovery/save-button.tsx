"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Bookmark } from "lucide-react";
import { useSavedEvents } from "@/lib/saved-events";

export function SaveButton({
  className,
  slug,
  title,
  variant = "overlay",
}: {
  className?: string;
  slug: string;
  title: string;
  variant?: "overlay" | "inline";
}) {
  const { isSaved, toggle } = useSavedEvents();
  const saved = isSaved(slug);

  if (variant === "inline") {
    return (
      <Button
        aria-pressed={saved}
        className={cn("h-11", className)}
        onClick={() => toggle(slug)}
        size="lg"
        variant="outline"
      >
        <Bookmark
          className={cn(saved && "fill-current")}
          data-icon="inline-start"
        />
        {saved ? "Saved" : "Save"}
      </Button>
    );
  }

  return (
    <button
      aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
      aria-pressed={saved}
      className={cn(
        "flex size-10 items-center justify-center rounded-full bg-white/95 text-events-ink shadow-sm transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-ring",
        className
      )}
      onClick={() => toggle(slug)}
      type="button"
    >
      <Bookmark
        className={cn(
          "size-5",
          saved && "fill-events-hibiscus text-events-hibiscus"
        )}
      />
    </button>
  );
}
