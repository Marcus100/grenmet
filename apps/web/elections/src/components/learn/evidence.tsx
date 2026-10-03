import Link from "next/link";
import { EVIDENCE, EVIDENCE_LABELS, type EvidenceId } from "@/data/evidence";

export function EvidenceCitation({ id }: { id: EvidenceId }) {
  const source = EVIDENCE[id];
  return (
    <details className="text-base text-el-muted">
      <summary className="cursor-pointer">
        {EVIDENCE_LABELS[source.kind]} · {source.title}
      </summary>
      <div className="mt-2 space-y-1 border-el-rule border-l-2 pl-3">
        <p>
          <a className="underline underline-offset-4" href={source.url}>
            {source.publisher}: {source.title}
          </a>
          {source.published
            ? ` (${source.published})`
            : " · publication date not stated"}
        </p>
        <p>{source.locator}</p>
        <p>{source.note}</p>
      </div>
    </details>
  );
}

export function CalculationNote({
  formula,
  children,
}: {
  formula: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="my-4 border-el-rule border-l-2 pl-4 text-base">
      <p className="font-semibold leading-relaxed">
        Our calculation, not an official published statistic
      </p>
      <p className="mt-1 text-el-ink-2 leading-relaxed">{formula}</p>
      {children}
      <Link
        className="mt-2 inline-block underline underline-offset-4"
        href="/sources"
      >
        Inspect sources and limitations
      </Link>
    </div>
  );
}
