import { cn } from "@barrelsgd/ui/lib/utils";
import { partyColor, partyFillIsDark } from "@/data/parties";

/** A party's colour always comes with its name; never colour alone. */
export function PartyDot({ party }: { party: string }) {
  return (
    <i
      aria-hidden="true"
      className="mr-1.5 inline-block size-2.5 rounded-[2px] align-[-1px]"
      style={{ background: partyColor(party) }}
    />
  );
}

/** A filled square with a constituency code, coloured by the party. */
export function SeatSquare({
  code,
  party,
  label,
  className,
}: {
  code: string;
  party: string;
  label: string;
  className?: string;
}) {
  return (
    <span
      aria-label={label}
      className={cn(
        "grid aspect-square place-items-center rounded-[2px] font-bold text-base",
        partyFillIsDark(party) ? "text-white" : "text-[#121314]",
        className
      )}
      role="img"
      style={{ background: partyColor(party) }}
      title={label}
    >
      {code}
    </span>
  );
}
