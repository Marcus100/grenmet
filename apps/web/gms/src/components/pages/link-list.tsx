import { ArrowRightIcon } from "lucide-react";

export interface ListedLink {
  description: string;
  href: string;
  meta?: string;
  name: string;
}

/** Card list of onward links — downloads, publications, related pages. */
export function LinkList({ links }: { links: readonly ListedLink[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {links.map((link) => (
        <li key={link.href}>
          <a
            className="group flex h-full items-start gap-3 rounded-gm-card border border-gm-border bg-background p-4 hover:border-gm-blue-ink focus-visible:border-gm-blue-ink lg:p-5"
            href={link.href}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-bold text-body-base text-gm-navy leading-body-base group-hover:underline">
                {link.name}
              </span>
              <span className="text-body text-gm-text-secondary leading-body">
                {link.description}
              </span>
              {link.meta && (
                <span className="font-bold text-gm-sky-ink text-label uppercase leading-label tracking-wider">
                  {link.meta}
                </span>
              )}
            </span>
            <ArrowRightIcon
              aria-hidden="true"
              className="mt-1 size-4 shrink-0 text-gm-blue-ink"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
