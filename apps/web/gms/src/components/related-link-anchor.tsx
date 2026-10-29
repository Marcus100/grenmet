import type { Route } from "next";
import Link from "next/link";
import type { RelatedLink } from "@/lib/cms";
import { isOutsideLink, relatedLinkHref } from "@/lib/related-link-href";

const STYLE = "font-semibold text-gm-blue-ink hover:underline";

/** A plain related link: a GMS page stays in the site, an outside link opens safely. */
export function RelatedLinkAnchor({ link }: { link: RelatedLink }) {
  if (isOutsideLink(link)) {
    return (
      <a className={STYLE} href={link.url} rel="noopener noreferrer">
        {link.title}
      </a>
    );
  }
  return (
    <Link className={STYLE} href={relatedLinkHref(link) as Route}>
      {link.title}
    </Link>
  );
}
