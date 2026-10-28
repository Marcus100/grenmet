import { LinkedAlert } from "@/components/linked-alert";
import { LinkedPage } from "@/components/linked-page";
import { LinkedProduct } from "@/components/linked-product";
import type { RelatedLink } from "@/lib/cms";

/**
 * The post's main related link as a card: an issued product or warning with
 * its live details, or a GMS page. Renders nothing for an outside link, which
 * cannot be the main link.
 */
export function FeaturedLink({
  className,
  link,
}: {
  className?: string;
  link: RelatedLink;
}) {
  if (!link.ref) return null;
  switch (link.type) {
    case "product":
      return <LinkedProduct className={className} productId={link.ref} />;
    case "cap":
      return <LinkedAlert className={className} identifier={link.ref} />;
    case "page":
      return (
        <LinkedPage
          className={className}
          fallbackTitle={link.title}
          path={link.ref}
        />
      );
    default:
      return null;
  }
}
