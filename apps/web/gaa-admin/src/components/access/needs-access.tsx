import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import { Lock } from "lucide-react";
import Link from "next/link";

/**
 * A module page for someone without the role it needs. It says which module,
 * what to ask for and where to go, instead of a 404 (a 404 looks broken and
 * hides why). Server component: it carries no data, only the explanation.
 */
export function NeedsAccess({
  ask,
  module,
}: {
  /** Who can grant the role, in plain words. */
  ask: string;
  /** The module name, for the heading, e.g. "Janitor". */
  module: string;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Lock />
        </EmptyMedia>
        <EmptyTitle>
          <h1>{module} access needed</h1>
        </EmptyTitle>
        <EmptyDescription>{ask}</EmptyDescription>
      </EmptyHeader>
      <Button nativeButton={false} render={<Link href="/" />} variant="outline">
        Back to home
      </Button>
    </Empty>
  );
}
