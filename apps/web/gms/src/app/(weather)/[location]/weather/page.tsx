import { prefixedLocationParams } from "@/lib/locations";

// Segment config must be declared here, not re-exported.
export const dynamicParams = false;

export function generateStaticParams() {
  return prefixedLocationParams();
}

/** Today at a place's Weather root, e.g. `/carriacou/weather`. */
export { default, generateMetadata } from "@/app/(weather)/[location]/page";
