import type { RelatedLink } from "@/lib/cms";
import { warningHref } from "@/lib/warning-detail";

type Addressed = Pick<RelatedLink, "ref" | "type" | "url">;

/**
 * Where a related link goes. A GMS product, warning or page is addressed from
 * its id, identifier or path, never from the host it was pasted with, so a
 * link pasted while testing still works on the live site.
 */
export function relatedLinkHref(link: Addressed): string {
  if (!link.ref) return link.url;
  switch (link.type) {
    case "product":
      return `/weather/issued/${link.ref}`;
    case "cap":
      return warningHref(link.ref);
    case "page":
      return link.ref;
    default:
      return link.url;
  }
}

/** True for a link that leaves the GMS site. */
export const isOutsideLink = (link: Pick<RelatedLink, "type">) =>
  link.type === "link";
