import { partyColor, partyInfo } from "@/data/parties";

/** One square per seat, grouped by party, largest first. */
export function SeatBar({
  seats,
  className,
}: {
  seats: Record<string, number>;
  className?: string;
}) {
  const order = Object.entries(seats).sort((a, b) => b[1] - a[1]);
  return (
    <span
      aria-label={order.map(([p, k]) => `${partyInfo(p).name} ${k}`).join(", ")}
      className={`flex flex-wrap gap-[3px] ${className ?? ""}`}
      role="img"
    >
      {order.flatMap(([party, count]) =>
        Array.from({ length: count }, (_, i) => `${party}-${i + 1}`).map(
          (key) => (
            <i
              className="block size-3.5 rounded-[2px]"
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
