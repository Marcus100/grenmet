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
            className="group rounded-gm-card border-gm-border bg-background hover:border-gm-blue-ink focus-visible:border-gm-blue-ink flex h-full items-start gap-3 border p-4 lg:p-5"
            href={link.href}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-body-base text-gm-heading leading-body-base font-bold group-hover:underline">
                {link.name}
              </span>
              <span className="text-body text-gm-text-secondary leading-body">
                {link.description}
              </span>
              {link.meta && (
                <span className="text-gm-sky-ink text-label leading-label font-bold tracking-wider uppercase">
                  {link.meta}
                </span>
              )}
            </span>
            <ArrowRightIcon
              aria-hidden="true"
              className="text-gm-blue-ink mt-1 size-4 shrink-0"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
