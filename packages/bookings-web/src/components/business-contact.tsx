"use client";

import type { BookingBusinessContact } from "@barrelsgd/api-client";
import { type ContactLink, contactLinks } from "../lib/business-contact";

const NEW_TAB_HINT = "(opens in a new tab)";

function ContactAnchor({ item }: { item: ContactLink }) {
  if (item.external) {
    return (
      <a
        className="contact-link"
        href={item.href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {item.label}
        <span aria-hidden="true" className="contact-external">
          {" "}
          ↗
        </span>
        <span className="contact-hint"> {NEW_TAB_HINT}</span>
      </a>
    );
  }
  return (
    <a className="contact-link" href={item.href}>
      {item.label}
    </a>
  );
}

/**
 * The business's contact links as a list. Renders nothing when the business
 * has set none, so callers keep their own "contact the business directly"
 * wording for that case.
 */
export function ContactLinks({
  contact,
  label = "Ways to contact the business",
}: {
  contact: BookingBusinessContact | null | undefined;
  /** Accessible name of the list. */
  label?: string;
}) {
  const links = contactLinks(contact);
  if (links.length === 0) {
    return null;
  }
  return (
    <ul aria-label={label} className="contact-links">
      {links.map((item) => (
        <li key={item.kind}>
          <ContactAnchor item={item} />
        </li>
      ))}
    </ul>
  );
}

/**
 * "Questions? Contact us" with the business's links, for near the top of a
 * public page. Renders nothing when every option is empty.
 */
export function ContactStrip({
  contact,
}: {
  contact: BookingBusinessContact | null | undefined;
}) {
  if (contactLinks(contact).length === 0) {
    return null;
  }
  return (
    <aside aria-labelledby="contact-strip-title" className="contact-strip">
      <p className="contact-strip-title" id="contact-strip-title">
        Questions? Contact us
      </p>
      <ContactLinks contact={contact} label="Contact us" />
    </aside>
  );
}
