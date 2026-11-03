import { cn } from "@barrelsgd/ui/lib/utils";

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "border-signal-gold text-signal-green inline-block border-b-2 pb-0.5 text-sm font-semibold tracking-wider uppercase",
        className
      )}
    >
      {children}
    </span>
  );
}
