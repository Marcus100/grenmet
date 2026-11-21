import type { RefundTerms } from "@/domain/types";
import { refundTermsLines } from "@/lib/refund-terms";

/**
 * The refund terms a buyer sees before paying and on their ticket: the terms in
 * one sentence, then that an organiser's cancel refunds in full. Plain text, so
 * it renders on the server.
 */
export function RefundTermsLine({ terms }: { terms: RefundTerms }) {
  const lines = refundTermsLines(terms);
  return (
    <div className="text-caption text-muted-foreground space-y-0.5">
      <p>{lines.summary}</p>
      <p>{lines.cancelled}</p>
    </div>
  );
}
