import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import { Lock } from "lucide-react";

export function NoAccess() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Lock />
        </EmptyMedia>
        <EmptyTitle>
          <h1>Stores access needed</h1>
        </EmptyTitle>
        <EmptyDescription>
          Ask your department head to give you a stores role. You also need an
          active staff record.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
