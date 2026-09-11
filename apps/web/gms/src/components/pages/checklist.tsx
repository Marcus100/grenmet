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
      className="flex gap-2 text-body-base text-gm-text-secondary leading-body-base"
      key={item}
    >
      <span aria-hidden="true" className="text-gm-blue-ink">
        {ordered ? "" : "•"}
      </span>
      <span>{item}</span>
    </li>
  ));

  return ordered ? (
    <ol className={`${className} list-inside list-decimal`}>{content}</ol>
  ) : (
    <ul className={className}>{content}</ul>
  );
}
