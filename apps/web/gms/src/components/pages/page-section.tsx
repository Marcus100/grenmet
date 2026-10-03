/**
 * Heading-plus-body block used by the standing content pages. Sections stack
 * inside a page; the heading is optional so a page can open with plain prose.
 */
export function PageSection({
  children,
  heading,
}: {
  children: React.ReactNode;
  heading?: string;
}) {
  return (
    <section className="mb-8 lg:mb-12">
      {heading && (
        <h2 className="mb-3 text-balance font-bold font-gm-display text-gm-heading text-heading-md leading-heading-md lg:mb-4">
          {heading}
        </h2>
      )}
      {children}
    </section>
  );
}
