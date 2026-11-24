// The business's own booking policy (late fees and so on), as plain text. React
// escapes it, and the line breaks the business typed are kept.

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
  policy,
  rules,
  showRules = true,
}: {
  policy?: string | null;
  rules: BookingRulesInput;
  /** False once a booking can no longer change: only the full policy stays. */
  showRules?: boolean;
}) {
  const text = policy?.trim();
  return (
    <div className="booking-rules">
      {/* Always mounted, so a changed amount is read out. */}
      <div aria-live="polite">
        {showRules ? (
          <p className="booking-rules-line">{bookingRulesLine(rules)}</p>
        ) : null}
      </div>
      {text ? (
        <details className="full-policy">
          <summary className="full-policy-summary">Full policy</summary>
          <BookingPolicyText text={text} />
        </details>
      ) : null}
    </div>
  );
}
