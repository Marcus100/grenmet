import type { Metadata } from "next";
import { NoAccess } from "@/components/no-access";
import { OrganisationList } from "@/components/organisation-list";
import { loadMyOrganisations } from "@/lib/hr-organisations";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Your organisations",
};

export const dynamic = "force-dynamic";

/**
 * The organisation picker: the organisations this person can route to. One
 * organisation is still listed, so the page never guesses. An empty list is the
 * "no access" state; a failed read says it could not load, never "no access".
 */
export default async function OrganisationPickerPage() {
  const session = await requireSession("/");
  const load = await loadMyOrganisations(session.accessToken);

  let body: React.ReactNode;
  if (!load.ok) {
    body = (
      <p className="text-muted-foreground" role="alert">
        We could not load your organisations just now. Refresh the page to try
        again.
      </p>
    );
  } else if (load.organisations.length === 0) {
    body = <NoAccess />;
  } else {
    body = <OrganisationList organisations={load.organisations} />;
  }

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6"
      id="main-content"
    >
      <header className="space-y-1">
        <p className="text-muted-foreground text-sm font-medium">Barrels HR</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Your organisations
        </h1>
      </header>

      {body}
    </main>
  );
}
