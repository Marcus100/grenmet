import { cn } from "@/lib/utils";

/** Ordered preparedness steps or an unordered kit list. */
export function Checklist({
  items,
  ordered = false,
}: {
  items: readonly string[];
  ordered?: boolean;
}) {
  const className = "flex flex-col gap-2";
  const content = items.map((item) => (
    <li
      className="text-body-base text-gm-text-secondary leading-body-base flex gap-2"
      key={item}
    >
      <span aria-hidden="true" className="text-gm-blue-ink">
        {ordered ? "" : "•"}
      </span>
      <span>{item}</span>
    </li>
  ));

  return ordered ? (
    <ol className={cn(className, "list-inside list-decimal")}>{content}</ol>
  ) : (
    <ul className={className}>{content}</ul>
  );
}
