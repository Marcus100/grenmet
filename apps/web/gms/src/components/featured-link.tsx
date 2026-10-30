import { LinkedAlert } from "@/components/linked-alert";
import { LinkedPage } from "@/components/linked-page";
import type { RelatedLink } from "@/lib/cms";

/**
 * The post's main related link as a card: a warning with its live details,
 * or a GMS page. Issued products and outside links stay plain links.
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
