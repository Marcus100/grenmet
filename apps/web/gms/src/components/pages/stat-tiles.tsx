export interface Stat {
  detail?: string;
  label: string;
  value: string;
}

/** Small figure grid — station counts, normals, totals at a glance. */
export function StatTiles({ stats }: { stats: readonly Stat[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          className="rounded border border-gm-border bg-background p-4 lg:p-5"
          key={stat.label}
        >
          <p className="text-gm-text-muted text-label leading-label">
            {stat.label}
          </p>
          <p className="font-bold text-gm-navy text-heading-sm leading-heading-sm">
            {stat.value}
          </p>
          {stat.detail && (
            <p className="text-body text-gm-text-secondary leading-body">
              {stat.detail}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
