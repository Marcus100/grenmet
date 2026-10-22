/**
 * How roles behave, in words. Shown on the team screen whether or not there is
 * anyone to manage, so the rules are never hidden behind an empty list.
 */
export function TeamHelp() {
  return (
    <section
      aria-labelledby="team-help-title"
      className="space-y-2 rounded-2xl border border-border bg-card p-4"
    >
      <h2
        className="font-display font-semibold text-heading-sm"
        id="team-help-title"
      >
        How roles work
      </h2>
      <ul className="list-disc space-y-1 pl-5 text-body text-muted-foreground">
        <li>
          Owners and admins already have every role of the products your
          organisation uses. Roles here are for everyone else.
        </li>
        <li>
          You can only give or take away a role you hold yourself, and never
          your own roles.
        </li>
        <li>
          A role can end on a date you choose (the end of that day in UTC), or
          stay until someone takes it away.
        </li>
        <li>
          Taking a role away is not passed on. If a member gave a role to
          someone else and then loses their own role or is demoted, what they
          gave stays until you take it away. Removing a member from the
          organisation does take away the roles they gave.
        </li>
      </ul>
    </section>
  );
}
