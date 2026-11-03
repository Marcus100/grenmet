"use client";
import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** Renders a value (an otpauth:// URI, a venue code) as a scannable image; generated in the browser. */
export function QrCode({
  label = "QR code for your authenticator app",
  value,
}: {
  readonly label?: string;
  readonly value: string;
}) {
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
        className="bg-muted size-48 animate-pulse rounded-lg"
      />
    );
  }
  return (
    // Scanners need a light field in both themes, hence the page-surface token.
    <Image
      alt={label}
      className="border-border bg-gm-surface-page size-48 rounded-lg border p-2"
      height={192}
      src={src}
      unoptimized
      width={192}
    />
  );
}
