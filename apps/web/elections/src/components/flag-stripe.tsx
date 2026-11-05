import { cn } from "@barrelsgd/ui/lib/utils";

/**
 * Grenada's red, gold and green, always shown together so the stripe reads
 * as national rather than as a party colour. Decorative only.
 */
export function FlagStripe({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex h-1 w-full", className)}
      data-testid="flag-stripe"
    >
      <span className="bg-el-flag-red flex-1" />
      <span className="bg-el-flag-gold flex-1" />
      <span className="bg-el-flag-green flex-1" />
    </div>
  );
}
