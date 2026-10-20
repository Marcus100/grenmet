export default function Loading() {
  return (
    <output aria-live="polite" className="block space-y-4 py-6">
      <span className="sr-only">Loading your rewards…</span>
      <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
      <div className="h-24 animate-pulse rounded bg-muted" />
      <div className="h-24 animate-pulse rounded bg-muted" />
    </output>
  );
}
