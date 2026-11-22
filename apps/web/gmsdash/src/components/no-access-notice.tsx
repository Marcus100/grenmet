/**
 * The notice for a signed-in person who belongs to no organisation: nothing
 * here can be requested by them, and who can give them a place. Access is per
 * organisation, requested by an owner or admin once the person belongs to one.
 * The same wording is used on the Home and Access pages.
 */
export function NoOrganisationNotice() {
  return (
    <div className="bg-muted max-w-2xl space-y-2 rounded-md border px-4 py-3">
      <h3 className="text-lg font-semibold">You do not have access yet</h3>
      <p className="text-sm">
        You are not a member of an organisation yet, so there is nothing here to
        request. Ask an owner or admin of your organisation to invite you.
        Access is requested per organisation, by its owner or admin, once you
        belong to it.
      </p>
    </div>
  );
}
