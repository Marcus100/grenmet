"use client";

import { type RefObject, useEffect, useState } from "react";

interface PaperLayout {
  scale: number;
  top: number;
}

/**
 * Computes a scale + top offset that fits a fixed-size paper into `parentRef`,
 * keeping it centered within the currently-visible slice of the container as the
 * page scrolls. Lifted from the template's invoice preview.
 */
export function usePaperScale(
  parentRef: RefObject<HTMLElement | null>,
  {
    height,
    maxScale,
    padding = 16,
    width,
  }: { height: number; maxScale: number; padding?: number; width: number }
) {
  const [layout, setLayout] = useState<PaperLayout | null>(null);

  useEffect(() => {
    function updateLayout() {
      const parent = parentRef.current;
      if (!parent) {
        return;
      }

      const parentRect = parent.getBoundingClientRect();
      const visibleTop = Math.max(parentRect.top, 0);
      const visibleBottom = Math.min(parentRect.bottom, window.innerHeight);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const visibleCenter =
        visibleHeight > 0
          ? visibleTop + visibleHeight / 2 - parentRect.top
          : parent.clientHeight / 2;

      const availableWidth = Math.max(0, parent.clientWidth - padding * 2);
      const availableHeight = Math.max(0, parent.clientHeight - padding * 2);
      const scale = Math.min(
        maxScale,
        availableWidth / width,
        availableHeight / height
      );
      const nextScale = Number.isFinite(scale)
        ? Math.max(0.1, scale)
        : maxScale;
      const scaledHeight = height * nextScale;
      const maxTop = Math.max(
        padding,
        parent.clientHeight - scaledHeight - padding
      );
      const nextTop = Math.min(
        Math.max(visibleCenter - scaledHeight / 2, padding),
        maxTop
      );

      setLayout((current) =>
        current?.top === nextTop && current.scale === nextScale
          ? current
          : { scale: nextScale, top: nextTop }
      );
    }

    updateLayout();
    window.addEventListener("scroll", updateLayout, { passive: true });
    window.addEventListener("resize", updateLayout);

    return () => {
      window.removeEventListener("scroll", updateLayout);
      window.removeEventListener("resize", updateLayout);
    };
  }, [height, maxScale, padding, parentRef, width]);

  return layout;
}
