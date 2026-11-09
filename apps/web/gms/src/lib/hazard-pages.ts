import type { BULLETIN_CATEGORIES } from "@barrelsgd/gms/products";
import type { Route } from "next";

/** The "how to prepare" page for a hazard, where GMS has written one. */
export const PREPARE_PAGE: Partial<
  Record<keyof typeof BULLETIN_CATEGORIES, { href: Route; label: string }>
> = {
  cyclone: {
    href: "/alerts/prepare/hurricane",
    label: "How to prepare for a hurricane",
  },
  flood: {
    href: "/alerts/prepare/flood",
    label: "How to prepare for flooding",
  },
  thunderstorm: {
    href: "/alerts/prepare/lightning",
    label: "How to stay safe in a thunderstorm",
  },
  heat: { href: "/alerts/prepare/heat", label: "How to cope with heat" },
  tsunami: {
    href: "/alerts/prepare/tsunami",
    label: "How to prepare for a tsunami",
  },
};
