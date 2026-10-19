import type { MetadataRoute } from "next";
import { NAV, SITE_URL } from "@/data/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return NAV.map((item) => ({ url: `${SITE_URL}${item.href}` }));
}
