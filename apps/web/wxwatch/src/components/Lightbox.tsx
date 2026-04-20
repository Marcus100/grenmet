"use client";

import Image from "next/image";
import { useCallback, useEffect } from "react";
import type { WeatherImage } from "@/db/schema";
import { getImageUrl } from "@/lib/utils";

interface LightboxProps {
  image: WeatherImage | null;
  onClose: () => void;
}

export function Lightbox({ image, onClose }: LightboxProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (image) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [image, handleKeyDown]);

  if (!image) return null;

  const imageUrl = getImageUrl(image.storagePath);
  const fetchedDate = image.fetchedAt
    ? new Date(image.fetchedAt).toLocaleString()
    : "Unknown";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        aria-label="Close lightbox"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />

      {/* Close button */}
      <button
        aria-label="Close lightbox"
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 transition-colors hover:bg-white/20"
        onClick={onClose}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="h-8 w-8 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            d="M6 18L18 6M6 6l12 12"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </svg>
      </button>

      {/* Content container */}
      <div
        aria-modal="true"
        className="relative flex max-h-[90vh] max-w-[90vw] flex-col"
        role="dialog"
      >
        {/* Image */}
        <div className="relative flex flex-1 items-center justify-center">
          <Image
            alt={image.name || "Weather image"}
            className="max-h-[80vh] max-w-full rounded-lg object-contain"
            height={image.height || 600}
            priority
            src={imageUrl}
            unoptimized={image.fileFormat === "gif"}
            width={image.width || 800}
          />
        </div>

        {/* Metadata panel */}
        <div className="mt-4 rounded-lg bg-white/10 p-4 text-white backdrop-blur">
          <h3 className="mb-2 font-semibold text-lg">
            {image.name || "Untitled"}
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <span className="text-gray-400">Spider:</span>
              <p className="capitalize">
                {image.spiderName?.replace(/_/g, " ") || "Unknown"}
              </p>
            </div>
            <div>
              <span className="text-gray-400">Dimensions:</span>
              <p>
                {image.width || "?"} × {image.height || "?"}
              </p>
            </div>
            <div>
              <span className="text-gray-400">Format:</span>
              <p className="uppercase">{image.fileFormat || "Unknown"}</p>
            </div>
            <div>
              <span className="text-gray-400">Fetched:</span>
              <p>{fetchedDate}</p>
            </div>
          </div>
          {image.isAnimated && (
            <p className="mt-2 text-blue-300 text-sm">
              Animated ({image.frameCount || "?"} frames)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
