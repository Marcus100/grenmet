"use client";

import type { BookingBusinessContact } from "@barrelsgd/api-client";
import {
  depositReceivedLine,
  depositToPayLine,
  splitLinks,
} from "../lib/booking-extras";
import { contactEnding } from "../lib/business-contact";
import { ContactLinks } from "./business-contact";

const NEW_TAB_HINT = "(opens in a new tab)";
/** The warning under payment instructions that carry a web address. */
const CHECK_THE_ADDRESS = "Check the web address before you pay.";

/**
 * The business's own text, as plain text: React escapes it and the host's CSS
 * keeps its line breaks. Only plain http(s) addresses become links, shown as
 * typed, in a new tab with no referrer and no search credit.
 *
 * `linkNote` is the line under the text when it carries a link; null for text
 * that asks for no payment, such as what a business says about itself.
 */
export function PlainText({
  linkNote = CHECK_THE_ADDRESS,
  text,
}: {
  linkNote?: string | null;
  text: string;
}) {
  const parts = splitLinks(text);
  const hasLink = parts.some((part) => part.kind === "link");
  return (
    <>
      <p className="deposit-instructions">
        {parts.map((part) =>
          part.kind === "link" ? (
            <a
              className="deposit-link"
              href={part.href}
              key={part.start}
              rel="noopener noreferrer nofollow"
              target="_blank"
            >
              {part.text}
              <span className="contact-hint"> {NEW_TAB_HINT}</span>
            </a>
          ) : (
            <span key={part.start}>{part.text}</span>
          )
        )}
      </p>
      {hasLink && linkNote ? <p className="muted">{linkNote}</p> : null}
    </>
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

/**
 * A business deposit the business has confirmed as received. Calm and short: no
 * method, no reference, no instructions and no amount to pay.
 */
export function DepositReceivedNotice({
  businessName,
  currency,
  minor,
}: {
  businessName: string;
  currency: string;
  minor: number;
}) {
  const who = businessName.trim() || "The business";
  return (
    <section
      aria-labelledby="deposit-received-title"
      className="notice deposit-business"
    >
      <h3 className="deposit-title" id="deposit-received-title">
        {depositReceivedLine(minor, currency)}
      </h3>
      <p className="muted">{who} has your deposit. Thank you.</p>
    </section>
  );
}
