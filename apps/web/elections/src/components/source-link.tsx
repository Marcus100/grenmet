import type { SourceRef } from "@/data/types";

/** A cited source, by key into the campaign sources list. */
export function SourceLink({
  id,
  sources,
}: {
  id: string;
  sources: Record<string, SourceRef>;
}) {
  if (id === "PEO") return <span>Parliamentary Elections Office</span>;
  const ref = sources[id];
  if (!ref) return <span>{id}</span>;
  return (
    <a
      className="underline decoration-el-rule-2 underline-offset-2 hover:decoration-el-ink"
      href={ref[1]}
      rel="noopener"
      target="_blank"
    >
      {ref[0]}
    </a>
  );
}
