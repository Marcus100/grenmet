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
        "inline-block border-signal-gold border-b-2 pb-0.5 font-semibold text-signal-green text-sm uppercase tracking-wider",
        className
      )}
    >
      {children}
    </span>
  );
}
