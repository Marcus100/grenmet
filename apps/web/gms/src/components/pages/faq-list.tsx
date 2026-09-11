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
          className="rounded border border-gm-border bg-background p-4 lg:p-5"
          key={entry.question}
        >
          <summary className="cursor-pointer font-bold text-body-base text-gm-navy leading-body-base">
            {entry.question}
          </summary>
          <p className="mt-2 text-body text-gm-text-secondary leading-body">
            {entry.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
