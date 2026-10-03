import { cn } from "@barrelsgd/ui/lib/utils";
import { partyColor, partyInfo } from "@/data/parties";

/**
 * One square per seat, grouped by party, largest first. Vertical stacks the
 * squares upwards from the largest party, for a column per election.
 */
export function SeatBar({
  seats,
  className,
  vertical = false,
}: {
  seats: Record<string, number>;
  className?: string;
  vertical?: boolean;
}) {
  const order = Object.entries(seats).sort((a, b) => b[1] - a[1]);
  return (
    <span
      aria-label={order.map(([p, k]) => `${partyInfo(p).name} ${k}`).join(", ")}
      className={cn(
        vertical ? "flex flex-col-reverse items-center" : "flex flex-wrap",
        "gap-[3px]",
        className
      )}
      role="img"
    >
      {order.flatMap(([party, count]) =>
        Array.from({ length: count }, (_, i) => `${party}-${i + 1}`).map(
          (key) => (
            <i
              className={cn(
                "block rounded-[2px]",
                vertical ? "size-3 sm:size-4" : "size-3.5"
              )}
              key={key}
              style={{ background: partyColor(party) }}
              title={`${partyInfo(party).name}: ${count}`}
            />
          )
        )
      )}
    </span>
  );
}
