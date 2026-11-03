import { cn } from "@barrelsgd/ui/lib/utils";
import type { ComponentType, ReactNode } from "react";

// External and feed links only (plain anchors); in-app links use next/link.
export function IconLink({
  children,
  className,
  compact = false,
  href,
  icon: Icon,
}: {
  children: ReactNode;
  className?: string;
  compact?: boolean;
  href: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <a
      className={cn(
        className,
        "group relative isolate flex items-center rounded-lg px-2 py-0.5 text-[0.8125rem]/6 font-medium text-white/30 transition-colors hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-sky-300",
        compact ? "gap-x-2" : "gap-x-3"
      )}
      href={href}
    >
      <span className="absolute inset-0 -z-10 scale-75 rounded-lg bg-white/5 opacity-0 transition group-hover:scale-100 group-hover:opacity-100" />
      {Icon && <Icon className="h-4 w-4 flex-none" />}
      <span className="self-baseline text-white">{children}</span>
    </a>
  );
}
