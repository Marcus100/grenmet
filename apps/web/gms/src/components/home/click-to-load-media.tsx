"use client";
import { PlayIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MediaEmbed, MediaKind } from "@/lib/media-embed";

/**
 * A desk post's audio or video (owner, 5 Nov 2026): a play button in the card
 * first. The provider's frame is not requested until the reader presses it, so
 * nothing loads from YouTube, Facebook or SoundCloud on a page view.
 */
const SIZE: Record<MediaKind, string> = {
  video: "aspect-video w-full",
  audio: "h-[166px] w-full",
};

export function ClickToLoadMedia({
  embed,
  kind,
  title,
}: {
  embed: MediaEmbed;
  kind: MediaKind;
  title: string;
}) {
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The play button is replaced by the frame, so focus would fall to the body.
  // Move it once, when the player starts; a later re-render never moves it.
  useEffect(() => {
    if (playing) frameRef.current?.focus();
  }, [playing]);
  if (playing) {
    return (
      <iframe
        allow="encrypted-media; picture-in-picture; fullscreen"
        className={`rounded-gm-card bg-gm-navy focus-visible:ring-gm-blue outline-none focus-visible:ring-2 ${SIZE[kind]}`}
        ref={frameRef}
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        src={embed.src}
        title={title}
      />
    );
  }
  return (
    <button
      className={`rounded-gm-card bg-gm-navy text-body text-gm-text-inverse leading-body hover:bg-gm-navy-raised focus-visible:ring-gm-blue flex items-center justify-center gap-2 font-semibold outline-none focus-visible:ring-2 ${SIZE[kind]}`}
      onClick={() => setPlaying(true)}
      type="button"
    >
      <PlayIcon aria-hidden="true" className="size-5" />
      Play {kind === "audio" ? "audio" : "video"} from {embed.provider}
    </button>
  );
}
