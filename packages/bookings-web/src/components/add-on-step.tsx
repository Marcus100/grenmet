"use client";

import type {
  BookingAddOnLine,
  BookingPublicAddOn,
  BookingPublicService,
} from "@barrelsgd/api-client";
import { addOnTotals, MAX_ADD_ONS } from "../lib/add-ons";
import { formatDuration, formatMoney } from "../lib/booking-format";

/**
 * "Add to your appointment": the add-ons offered with the chosen service, as
 * checkboxes, with the running total. The parent renders nothing when the
 * business has add-ons off or the service has none.
 */
export function AddOnStep({
  chosen,
  currency,
  offered,
  onToggle,
  service,
}: {
  chosen: readonly string[];
  currency: string;
  offered: readonly BookingPublicAddOn[];
  onToggle: (id: string) => void;
  service: BookingPublicService;
}) {
  const full = chosen.length >= MAX_ADD_ONS;
  const totals = addOnTotals(service, offered, chosen);
  return (
    <fieldset className="step add-ons">
      <legend>Add to your appointment (optional)</legend>
      <p className="muted">
        Each add-on adds time and cost. You can choose up to {MAX_ADD_ONS}.
      </p>
      {offered.map((addOn) => {
        const checked = chosen.includes(addOn.id);
        return (
          <label className="check add-on" key={addOn.id}>
            <input
              checked={checked}
              disabled={full && !checked}
              name="add_on"
              onChange={() => onToggle(addOn.id)}
              type="checkbox"
              value={addOn.id}
            />
            <span>
              <strong>{addOn.name}</strong>
              <span className="muted add-on-meta">
                {" "}
                +{formatDuration(addOn.duration_min)}, +
                {formatMoney(addOn.price_minor, currency)}
              </span>
              {addOn.description ? (
                <span className="muted add-on-description">
                  {addOn.description}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
      {/* One live region that is always mounted, so the first change is read out. */}
      <div aria-live="polite" data-testid="add-on-live" role="status">
        {full ? (
          <p className="muted">
            That is the most you can add ({MAX_ADD_ONS}). Untick one to choose
            another.
          </p>
        ) : null}
        {chosen.length > 0 ? (
          <p className="notice add-on-total">
            Your appointment: {formatDuration(totals.durationMin)},{" "}
            {formatMoney(totals.priceMinor, currency)} in total.
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}

/**
 * The add-ons on a booking, as they were priced when booked, for a summary list
 * (`<dl>`). Renders nothing when there are none.
 */
export function BookedAddOns({
  currency,
  lines,
}: {
  currency: string;
  lines?: readonly BookingAddOnLine[];
}) {
  if (!lines || lines.length === 0) {
    return null;
  }
  return (
    <div>
      <dt>Add-ons</dt>
      <dd>
        <ul className="add-on-lines">
          {lines.map((line) => (
            <li key={`${line.name}-${line.price_minor}-${line.duration_min}`}>
              {line.name}: +{formatDuration(line.duration_min)}, +
              {formatMoney(line.price_minor, currency)}
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}
