import { cn } from "@grenmet/ui/lib/utils";

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
        "inline-block border-signal-gold border-b-2 pb-0.5 font-semibold font-serif text-[0.7rem] text-signal-green uppercase tracking-wider",
        className
      )}
    >
      {children}
    </span>
  );
}
