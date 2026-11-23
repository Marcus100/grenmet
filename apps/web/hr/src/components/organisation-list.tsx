import type { HrMeOrganisationPublic } from "@barrelsgd/api-client";
import type { Route } from "next";
import Link from "next/link";
import { scopeLabel } from "@/lib/organisation-scope";

/**
 * The person's organisations, each a link to its own home at `/<slug>`. Each
 * row names the organisation and the access it gives, in words.
 */
export function OrganisationList({
  organisations,
}: {
  organisations: HrMeOrganisationPublic[];
}) {
  return (
    <ul className="divide-border divide-y rounded-lg border">
      {organisations.map((organisation) => (
        <li key={organisation.id}>
          <Link
            className="hover:bg-muted focus-visible:ring-ring flex min-h-14 flex-col justify-center gap-0.5 px-4 py-3 focus-visible:ring-2 focus-visible:outline-none"
            href={`/${organisation.slug}` as Route}
          >
            <span className="font-medium">{organisation.name}</span>
            <span className="text-muted-foreground text-sm">
              {scopeLabel(organisation.scope)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
