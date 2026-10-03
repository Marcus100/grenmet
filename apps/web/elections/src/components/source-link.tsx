import { EVIDENCE_LABELS, sourceKind } from "@/data/evidence";
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
  if (!ref) return <span>Source reference unavailable ({id})</span>;
  // A source we were given without a public link is named, not linked.
  if (!ref[1])
    return (
      <span>
        {EVIDENCE_LABELS.supplied}: {ref[0]}
      </span>
    );
  return (
    <a
      className="underline decoration-el-rule-2 underline-offset-2 hover:decoration-el-ink"
      href={ref[1]}
      rel="noopener"
      target="_blank"
    >
      {EVIDENCE_LABELS[sourceKind(ref)]}: {ref[0]}
    </a>
  );
}
