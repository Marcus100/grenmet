import { permanentRedirect } from "next/navigation";

/**
 * The old marine warnings page. Marine now has the same page as every other
 * hazard, so the old address redirects there. It is a page, not a
 * `ROUTE_MOVES` entry, because `/alerts/[identifier]` would otherwise serve the
 * address as a warning identifier.
 */
export const metadata = {
  title: "Marine alerts and warnings",
};

export default function MarineWarningsRedirect() {
  permanentRedirect("/alerts/bulletins/marine");
}
