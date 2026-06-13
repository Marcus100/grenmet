import { Play } from "lucide-react";
import Image from "next/image";

export function PodcastBlock() {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4 rounded-lg bg-signal-ink p-4 text-white sm:w-1/2">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-signal-green/30">
          <Image
            alt="Signal Audio Brief cover art"
            className="object-cover"
            fill
            sizes="64px"
            src="/images/placeholder-green.svg"
          />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm">The Grenada Signal Daily</p>
          <p className="truncate text-white/70 text-xs">
            Today's brief, read for the road — 3 min
          </p>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-signal-green px-3 py-1 font-medium text-xs">
            <Play className="size-3 fill-current" /> Play
          </span>
        </div>
      </div>
      <div className="sm:w-1/2">
        <p className="text-signal-muted text-sm">
          The{" "}
          <span className="font-semibold text-foreground">
            Grenada Signal Daily
          </span>{" "}
          covers the morning's essentials — news, weather, and opportunities —
          witty, informative, and everything you need to start your day.
        </p>
      </div>
    </div>
  );
}
