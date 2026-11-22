import Link from "next/link";

/**
 * What a signed-in person sees when no organisation of theirs can read the
 * meteograms yet: what the state means, who can give access, and where to ask
 * for it. Access is per organisation, so the people to ask are its owners and
 * admins; the Access page is where they request it.
 */
export function NoAccessNotice() {
  return (
    <section
      aria-labelledby="no-access-title"
      className="bg-muted max-w-2xl space-y-2 rounded-md border px-4 py-3"
    >
      <h2 className="text-xl font-semibold" id="no-access-title">
        You do not have access yet
      </h2>
      <p className="text-sm">
        You are signed in, but none of your organisations can read the
        meteograms yet. Ask an owner or admin of your organisation to add you to
        it.
      </p>
      <p className="text-sm">
        An owner or admin can ask GMS to enable the dashboard for the
        organisation on the{" "}
        <Link className="underline underline-offset-4" href="/access">
          Access page
        </Link>
        . GMS reviews the request.
      </p>
    </section>
  );
}
