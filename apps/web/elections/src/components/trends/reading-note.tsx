const LABEL =
  "font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]";

interface Term {
  meaning: React.ReactNode;
  term: string;
}

/**
 * The explainer under a Trends chart, in short pieces: how to read it step
 * by step, what stands out (figures worked out from the data), what to keep
 * in mind, and the terms it uses. Written for readers new to statistics.
 */
export function ReadingNote({
  read,
  example,
  findings = [],
  caveats = [],
  terms,
}: {
  read: React.ReactNode;
  example: React.ReactNode;
  findings?: React.ReactNode[];
  caveats?: React.ReactNode[];
  terms: Term[];
}) {
  return (
    <div className="mt-6 grid gap-x-10 gap-y-6 border-el-rule border-t pt-5 text-sm lg:grid-cols-2">
      <div className="space-y-6">
        <div className="bg-el-paper-2 p-5">
          <h3 className={LABEL}>A worked example</h3>
          <p className="mt-2 leading-relaxed">{example}</p>
        </div>
        <div>
          <h3 className={LABEL}>How to read it</h3>
          <p className="mt-2 text-el-ink-2">{read}</p>
        </div>
        {caveats.length > 0 && (
          <div>
            <h3 className={LABEL}>Keep in mind</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-el-ink-2">
              {caveats.map((caveat, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static list
                <li key={i}>{caveat}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="space-y-6">
        {findings.length > 0 && (
          <div className="border-el-ink border-l-2 pl-4">
            <h3 className={LABEL}>What stands out</h3>
            <ul className="mt-2 space-y-2">
              {findings.map((finding, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static list
                <li key={i}>{finding}</li>
              ))}
            </ul>
          </div>
        )}
        <details className="group">
          <summary className="cursor-pointer font-semibold underline decoration-el-rule-2 underline-offset-4">
            What the terms mean
          </summary>
          <dl className="mt-2 divide-y divide-el-rule border-el-rule border-y">
            {terms.map((t) => (
              <div
                className="grid gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[10rem_minmax(0,1fr)]"
                key={t.term}
              >
                <dt className="font-semibold">{t.term}</dt>
                <dd className="text-el-ink-2">{t.meaning}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </div>
  );
}

/** The fact sheet's opening figures: one number and one plain sentence each. */
export function KeyFacts({
  facts,
}: {
  facts: { figure: string; text: React.ReactNode }[];
}) {
  return (
    <ul className="grid gap-px border border-el-rule bg-el-rule sm:grid-cols-2 lg:grid-cols-3">
      {facts.map((f) => (
        <li className="bg-background p-4" key={f.figure}>
          <p className="font-bold font-serif text-[28px] tabular-nums leading-none">
            {f.figure}
          </p>
          <p className="mt-2 text-el-ink-2 text-sm">{f.text}</p>
        </li>
      ))}
    </ul>
  );
}
