"use client";

import type {
  BookingPublicService,
  BookingStorefront,
} from "@barrelsgd/api-client";
import { useState } from "react";
import { addOnsFor } from "../lib/add-ons";
import { businessDepositOf, newClientsNote } from "../lib/booking-extras";
import { formatDuration, formatMoney } from "../lib/booking-format";
import { isLongDescription } from "../lib/booking-link";
import { dueAtBooking } from "../lib/booking-payment";
import { bookingRulesLine } from "../lib/booking-policy";
import { BookingPolicyText } from "./booking-policy-text";

export interface ServiceDetailsProps {
  /** Add-ons are ticked: the amount then depends on them, so none is stated here. */
  addOnsChosen?: boolean;
  /** The id the radio's `aria-describedby` points at. */
  id: string;
  service: BookingPublicService;
  storefront: BookingStorefront;
}

/**
 * The description in plain text, line breaks kept. Long ones show three lines
 * and a "Read more" button that says whether it is open.
 */
function Description({ text, id }: { id: string; text: string }) {
  const [open, setOpen] = useState(false);
  const long = isLongDescription(text);
  return (
    <div className="service-description-block">
      <p
        className="service-description"
        data-clamped={long && !open ? "true" : undefined}
        id={`${id}-description`}
      >
        {text}
      </p>
      {long && (
        <button
          aria-controls={`${id}-description`}
          aria-expanded={open}
          className="btn service-read-more"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

/**
 * What the customer needs to know about the chosen service before going on:
 * its description, duration, price and what is paid when booking. Only the
 * wording the flow already uses. Shown under the service's row, never inside
 * its label, so its links and buttons keep working.
 */
export function ServiceDetails({
  addOnsChosen = false,
  id,
  service,
  storefront,
}: ServiceDetailsProps) {
  const addOns = addOnsFor(storefront.add_ons, service.id);
  const policy = storefront.booking_policy?.trim();
  const collectedByBusiness = storefront.deposit_collection === "business";
  const businessDeposit = collectedByBusiness ? businessDepositOf(service) : 0;
  const description = service.description?.trim();
  const newClients = newClientsNote(service);
  const payment = bookingRulesLine({
    businessDepositMinor: businessDeposit > 0 ? businessDeposit : undefined,
    businessName: storefront.display_name,
    currency: storefront.currency,
    cutoffHours: storefront.cancel_cutoff_hours,
    dueMinor: dueAtBooking(service),
    nonRefundable: storefront.deposit_non_refundable,
    ownDepositMinor: service.deposit_minor,
  });

  return (
    <div className="service-details" id={id}>
      {description ? <Description id={id} text={description} /> : null}
      <dl className="service-facts">
        <div>
          <dt>Duration</dt>
          <dd>{formatDuration(service.duration_min)}</dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd>{formatMoney(service.price_minor, storefront.currency)}</dd>
        </div>
      </dl>
      {payment && !addOnsChosen ? (
        <p className="service-payment">{payment}</p>
      ) : null}
      {newClients.map((line) => (
        <p className="service-new-clients" key={line}>
          {line}
        </p>
      ))}
      {addOns.length > 0 ? (
        <div className="service-add-ons">
          <p className="muted">Add-ons you can tick below:</p>
          <ul>
            {addOns.map((addOn) => (
              <li key={addOn.id}>
                {addOn.name},{" "}
                {formatMoney(addOn.price_minor, storefront.currency)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {policy ? (
        <details className="full-policy">
          <summary className="full-policy-summary">Full policy</summary>
          <BookingPolicyText text={policy} />
        </details>
      ) : null}
    </div>
  );
}
