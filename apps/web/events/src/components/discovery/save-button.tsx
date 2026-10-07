"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Bookmark } from "lucide-react";
import { useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import { setSaved } from "@/data/actions";

export function SaveButton({
  className,
  initiallySaved,
  slug,
  title,
  variant = "overlay",
}: {
  className?: string;
  initiallySaved: boolean;
  slug: string;
  title: string;
  variant?: "overlay" | "inline";
}) {
  const [saved, setSavedState] = useState(initiallySaved);
  const { pending, perform } = useMemberAction();

  async function toggle() {
    const next = !saved;
    const result = await perform(() => setSaved(slug, next));
    if (result.ok) {
      setSavedState(next);
    }
  }

  if (variant === "inline") {
    return (
      <Button
        aria-pressed={saved}
        className={cn("h-11", className)}
        disabled={pending}
        onClick={toggle}
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
      disabled={pending}
      onClick={toggle}
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
