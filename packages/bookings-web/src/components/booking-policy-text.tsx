// The business's own booking policy (late fees and so on), as plain text. React
// escapes it, and the line breaks the business typed are kept.

import type { BookingLateFee } from "@barrelsgd/api-client";
import { lateFeeLine } from "../lib/booking-extras";
import {
  type BookingRulesInput,
  bookingRulesLine,
} from "../lib/booking-policy";

export function BookingPolicyText({ text }: { text?: string | null }) {
  if (!text) {
    return null;
  }
  return <div className="muted whitespace-pre-line">{text}</div>;
}

/**
 * The one plain line about money and changes, with the business's full policy
 * one tap away. The disclosure is left out when the business wrote no policy.
 */
export function BookingRules({
  lateFee,
  policy,
  rules,
  showRules = true,
}: {
  /** The business's late-arrival rule, said once beside the cancellation rule. */
  lateFee?: BookingLateFee | null;
  policy?: string | null;
  rules: BookingRulesInput;
  /** False once a booking can no longer change: only the full policy stays. */
  showRules?: boolean;
}) {
  const text = policy?.trim();
  const lateFeeText = lateFeeLine(lateFee, rules.currency);
  return (
    <div className="booking-rules">
      {/* Always mounted, so a changed amount is read out. */}
      <div aria-live="polite">
        {showRules ? (
          <p className="booking-rules-line">{bookingRulesLine(rules)}</p>
        ) : null}
      </div>
      {lateFeeText ? <p className="booking-rules-line">{lateFeeText}</p> : null}
      {text ? (
        <details className="full-policy">
          <summary className="full-policy-summary">Full policy</summary>
          <BookingPolicyText text={text} />
        </details>
      ) : null}
    </div>
  );
}
