export interface FaqEntry {
  answer: string;
  question: string;
}

/**
 * Native disclosure list — no client component needed, and it stays keyboard
 * and screen-reader accessible without any JavaScript.
 */
export function FaqList({ entries }: { entries: readonly FaqEntry[] }) {
  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => (
        <details
          className="rounded-gm-card border-gm-border bg-background border p-4 lg:p-5"
          key={entry.question}
        >
          <summary className="text-body-base text-gm-heading leading-body-base cursor-pointer font-bold">
            {entry.question}
          </summary>
          <p className="text-body text-gm-text-secondary leading-body mt-2">
            {entry.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
