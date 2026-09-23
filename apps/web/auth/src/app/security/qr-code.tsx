"use client";
import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** Renders an otpauth:// URI as a scannable image; generated in the browser. */
export function QrCode({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { margin: 1, width: 192 })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!src) {
    return (
      <div
        aria-hidden="true"
        className="size-48 animate-pulse rounded-lg bg-muted"
      />
    );
  }
  return (
    // Scanners need a light field in both themes, hence the page-surface token.
    <Image
      alt="QR code for your authenticator app"
      className="size-48 rounded-lg border border-border bg-gm-surface-page p-2"
      height={192}
      src={src}
      unoptimized
      width={192}
    />
  );
}
