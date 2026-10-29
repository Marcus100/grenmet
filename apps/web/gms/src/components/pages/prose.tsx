import { Children, type ReactNode } from "react";

/**
 * Paragraph run at the page body size. A paragraph may hold a measurement
 * (`Measure`), so it can be a node as well as text.
 */
export function Prose({ paragraphs }: { paragraphs: readonly ReactNode[] }) {
  return (
    // max-w-prose keeps the measure near 65 characters; tables and imagery
    // still take the full container width.
    <div className="flex max-w-prose flex-col gap-3 lg:gap-4">
      {Children.map(paragraphs, (paragraph) => (
        <p className="text-body-base text-gm-text-secondary leading-body-base">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
