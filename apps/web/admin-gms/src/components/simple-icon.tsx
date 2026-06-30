"use client";

import { cn } from "@grenmet/ui/lib/utils";
import type * as React from "react";
import type { SimpleIcon as SimpleIconType } from "simple-icons";

type SimpleIconProps = {
  icon: SimpleIconType;
  className?: string;
} & React.SVGProps<SVGSVGElement>;

export function SimpleIcon({ icon, className, ...props }: SimpleIconProps) {
  const { title, path } = icon;

  return (
    <svg
      aria-hidden="false"
      aria-label={title}
      className={cn("size-5 fill-foreground", className)}
      focusable="false"
      viewBox="0 0 24 24"
      {...props}
    >
      <title>{title}</title>
      <path d={path} />
    </svg>
  );
}
