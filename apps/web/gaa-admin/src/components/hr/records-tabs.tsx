"use client";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { PageRouteTabs } from "@/components/layout/page-tabs";

export const recordsTabs = [
  { href: "/hr/documents", label: "Documents" },
  { href: "/hr/training", label: "Training" },
  { href: "/hr/parking", label: "Parking" },
] as const;

/** Section switcher shared by the Records pages (documents, training, parking). */
export function RecordsTabs() {
  const pathname = usePathname();
  const active =
    recordsTabs.find((tab) => pathname.startsWith(tab.href))?.href ?? "";
  return (
    <PageRouteTabs
      aria-label="Records"
      items={recordsTabs.map((tab) => ({
        href: tab.href as Route,
        label: tab.label,
        value: tab.href,
      }))}
      value={active}
    />
  );
}
