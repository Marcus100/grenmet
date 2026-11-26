"use client";

import { cn } from "@barrelsgd/ui/lib/utils";
import Image from "next/image";
import { useState } from "react";

/**
 * A business's cover photo in a frame the caller sizes. Decorative: the image
 * has an empty alt and is aria-hidden, because the business name already reads
 * out next to it. `scrim` lays a dark tint (`bg-foreground/70`) over the photo
 * so white text on top clears 4.5:1 on any photo, including a white one.
 *
 * The caller sets the frame's position (`relative`, or `absolute inset-0` inside
 * a positioned parent) and size through `className`. A photo that fails to load
 * removes the whole frame, so the caller's fill shows underneath (the card's
 * brand colour, or no banner).
 *
 * `referrerPolicy="no-referrer"`: the storage host gets no page address.
 * `unoptimized`: the photo is a storage URL, shown as stored.
 */
export function CoverPhoto({
  className,
  scrim = false,
  src,
}: Readonly<{ className?: string; scrim?: boolean; src: string }>) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return null;
  }
  return (
    <span aria-hidden="true" className={cn("block overflow-hidden", className)}>
      <Image
        alt=""
        className="absolute inset-0 size-full object-cover"
        height={300}
        loading="lazy"
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        src={src}
        unoptimized
        width={600}
      />
      {scrim ? <span className="bg-foreground/70 absolute inset-0" /> : null}
    </span>
  );
}
