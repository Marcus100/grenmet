"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * The business logo above the page heading. It loads with the page (priority,
 * above the fold) and CSS gives it a fixed height, so nothing moves when it
 * arrives. If it fails to load it is removed; the business name is already the
 * page heading, so the name stays on screen.
 *
 * `unoptimized`: the logo is a storage URL, so it is shown as it is stored and
 * no `remotePatterns` entry is needed. The width and height here are only the
 * intrinsic aspect hint; `.storefront-logo` sets the rendered size.
 */
export function StorefrontLogo({
  name,
  src,
}: Readonly<{ name: string; src: string }>) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return null;
  }
  return (
    <Image
      alt={name}
      className="storefront-logo"
      height={48}
      onError={() => setFailed(true)}
      priority
      src={src}
      unoptimized
      width={160}
    />
  );
}
