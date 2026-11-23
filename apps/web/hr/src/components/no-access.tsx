import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";

/**
 * Shown when the person is signed in but has no HR organisation (no live
 * employment or role assignment). Not an error, so it does not report.
 */
export function NoAccess() {
  return (
    <section aria-labelledby="no-access-heading">
      <Empty>
        <EmptyHeader>
          <EmptyTitle id="no-access-heading">No HR access yet</EmptyTitle>
          <EmptyDescription>
            Your Barrels HR access has not been set up, or it has ended. Ask
            your organisation&apos;s HR administrator to give you access, then
            sign in again.
          </EmptyDescription>
        </EmptyHeader>
        <form action="/auth/logout" method="post">
          <Button type="submit" variant="outline">
            Sign out of Barrels HR
          </Button>
        </form>
      </Empty>
    </section>
  );
}
