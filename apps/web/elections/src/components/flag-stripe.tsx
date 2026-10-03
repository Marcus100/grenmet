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
      <span className="flex-1 bg-el-flag-red" />
      <span className="flex-1 bg-el-flag-gold" />
      <span className="flex-1 bg-el-flag-green" />
    </div>
  );
}
