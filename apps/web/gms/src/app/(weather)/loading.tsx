import { Skeleton } from "@barrelsgd/ui/components/ui/skeleton";

/**
 * Shown instantly while the weather page loads. Neutral shapes only: a warning
 * banner is never implied or hidden by this placeholder.
 */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="space-y-6"
      role="status"
    >
      <Skeleton className="h-64 w-full rounded-none sm:h-80" />
      <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}
