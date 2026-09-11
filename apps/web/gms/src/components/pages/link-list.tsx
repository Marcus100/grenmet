export interface ListedLink {
  description: string;
  href: string;
  meta?: string;
  name: string;
}

/** Card list of onward links — downloads, publications, related pages. */
export function LinkList({ links }: { links: readonly ListedLink[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {links.map((link) => (
        <li key={link.href}>
          <a
            className="flex flex-col gap-1 rounded border border-gm-border bg-background p-4 shadow-card lg:p-5"
            href={link.href}
          >
            <span className="font-bold text-body-base text-gm-navy leading-body-base">
              {link.name}
            </span>
            <span className="text-body text-gm-text-secondary leading-body">
              {link.description}
            </span>
            {link.meta && (
              <span className="text-gm-blue-ink text-label leading-label">
                {link.meta}
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
