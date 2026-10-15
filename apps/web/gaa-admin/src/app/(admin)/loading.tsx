import { Skeleton } from "@barrelsgd/ui/components/ui/skeleton";

/**
 * Shown instantly while the next page loads, so a tap or click gets visible
 * feedback before the server answers. Neutral shapes only: nothing here may read
 * as real content.
 */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="space-y-4"
      role="status"
    >
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}
