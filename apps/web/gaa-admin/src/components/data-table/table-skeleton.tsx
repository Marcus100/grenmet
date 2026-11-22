import { Skeleton } from "@barrelsgd/ui/components/ui/skeleton";

const ROW_IDS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"] as const;
const CELL_IDS = [
  "lead",
  "cell-2",
  "cell-3",
  "cell-4",
  "cell-5",
  "cell-6",
] as const;

/**
 * Placeholder rows for a list that is loading, in the shape of the real table.
 * It replaces plain "Loading..." text so the layout does not jump when the
 * data arrives. The label is announced once; the bars are decoration.
 */
export function TableSkeleton({
  columns,
  label,
  rows = ROW_IDS.length,
}: {
  columns: number;
  label: string;
  rows?: number;
}) {
  const ids = ROW_IDS.slice(0, Math.min(rows, ROW_IDS.length));
  return (
    <div aria-busy="true" className="grid gap-3" role="status">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="grid gap-3">
        {ids.map((id) => (
          <div
            className="grid items-center gap-4"
            key={id}
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {CELL_IDS.slice(0, columns).map((cell) => (
              <Skeleton
                className={cell === "lead" ? "h-5 w-3/4" : "h-4 w-1/2"}
                key={`${id}-${cell}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
