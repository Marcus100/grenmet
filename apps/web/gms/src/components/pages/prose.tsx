/** Paragraph run at the page body size. */
export function Prose({ paragraphs }: { paragraphs: readonly string[] }) {
  return (
    // max-w-prose keeps the measure near 65 characters; tables and imagery
    // still take the full container width.
    <div className="flex max-w-prose flex-col gap-3 lg:gap-4">
      {paragraphs.map((paragraph) => (
        <p
          className="text-body-base text-gm-text-secondary leading-body-base"
          key={paragraph}
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}
