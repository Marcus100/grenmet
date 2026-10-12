"use client";
import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const recordsTabs = [
  { href: "/hr/documents", label: "Documents" },
  { href: "/hr/training", label: "Training" },
  { href: "/hr/parking", label: "Parking" },
] as const;

/** Section switcher shared by the Records pages (documents, training, parking). */
export function RecordsTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Records"
      className="inline-flex items-center rounded-full border bg-muted p-0.5"
    >
      {recordsTabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1 font-medium text-sm transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
