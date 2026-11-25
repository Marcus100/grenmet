"use client";

import type { BookingBusinessContact } from "@barrelsgd/api-client";
import { depositToPayLine, splitLinks } from "../lib/booking-extras";
import { contactEnding } from "../lib/business-contact";
import { ContactLinks } from "./business-contact";

const NEW_TAB_HINT = "(opens in a new tab)";

/**
 * The business's own text, as plain text: React escapes it and the host's CSS
 * keeps its line breaks. Only plain http(s) addresses become links, shown as
 * typed, in a new tab with no referrer and no search credit.
 */
export function PlainText({ text }: { text: string }) {
  return (
    <p className="deposit-instructions">
      {splitLinks(text).map((part, index) =>
        part.kind === "link" ? (
          <a
            className="deposit-link"
            href={part.href}
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are static for one text
            key={index}
            rel="noopener noreferrer nofollow"
            target="_blank"
          >
            {part.text}
            <span className="contact-hint"> {NEW_TAB_HINT}</span>
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are static for one text
          <span key={index}>{part.text}</span>
        )
      )}
    </p>
  );
}

/**
 * A deposit the customer pays the business by hand: the amount and the
 * business's own instructions, labelled as theirs. Barrels takes no part in
 * this payment, and the wording says so.
 */
export function DepositToBusiness({
  amountNote,
  businessName,
  contact,
  currency,
  instructions,
  minor,
}: {
  /** Replaces the amount line (add-ons ticked: the total is not known yet). */
  amountNote?: string;
  businessName: string;
  contact: BookingBusinessContact | null | undefined;
  currency: string;
  instructions: string | null | undefined;
  minor: number;
}) {
  const who = businessName.trim() || "the business";
  const text = instructions?.trim();
  return (
    <section
      aria-labelledby="deposit-business-title"
      className="notice deposit-business"
    >
      <p className="deposit-amount">
        <strong>{amountNote ?? depositToPayLine(minor, currency)}</strong>
      </p>
      <h3 className="deposit-title" id="deposit-business-title">
        How to pay your deposit to {who}
      </h3>
      <p className="muted">
        You pay this directly to {who}, not through Barrels. These are the
        business's own instructions.
      </p>
      {text ? (
        <PlainText text={text} />
      ) : (
        <>
          <p>
            The business has not added payment instructions. Please contact{" "}
            {who}
            {contactEnding(contact)}
          </p>
          <ContactLinks contact={contact} />
        </>
      )}
    </section>
  );
}
