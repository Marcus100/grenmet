"use client";

import type { BookingPublicDetail } from "@barrelsgd/api-client";
import { useState } from "react";
import { type Outcome, tellsToContact } from "../lib/booking-errors";
import {
  businessDepositWhileOpen,
  lateFeeWhileActive,
} from "../lib/booking-extras";
import {
  formatDateTime,
  formatHours,
  formatMoney,
} from "../lib/booking-format";
import { paymentReceivedHeld } from "../lib/booking-payment";
import { type BookingRulesInput, holdEndsLine } from "../lib/booking-policy";
import type { ManageBookingActions, SlotList } from "../lib/booking-types";
import { contactEnding } from "../lib/business-contact";
import { BookedAddOns } from "./add-on-step";
import { BookedExtras } from "./booking-extras";
import { BookingRules } from "./booking-policy-text";
import { ContactLinks } from "./business-contact";

import { PaymentStatus } from "./payment-status";
import { SlotPicker } from "./slot-picker";

export interface ManageBookingProps {
  /** Server calls for cancel, reschedule and slots, passed in by the host app. */
  actions: ManageBookingActions;
  /** The booking, with the business's own contact options (`contact`). */
  booking: BookingPublicDetail;
  /** Where the "Add to calendar" link goes (the host serves the .ics file). */
  calendarHref: string;
  token: string;
}

const NETWORK_MESSAGE =
  "We couldn't reach the booking service. Please try again.";

const STATUS_TEXT: Record<string, string> = {
  pending: "Waiting for the studio to confirm",
  pending_payment: "Waiting for payment",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "Missed",
};

const ACTIVE = new Set(["pending", "pending_payment", "confirmed"]);
/** The most a customer can write as a reason; the API refuses more. */
const REASON_MAX = 300;

const CANCELLED_NOTICE =
  "Your booking is cancelled. We have emailed you a confirmation and told the business.";

/** The rules line's inputs: the booking's own snapshot of what was set when it was made. */
function manageRules(booking: BookingPublicDetail): BookingRulesInput {
  return {
    bookingStatus: booking.status,
    businessDepositMinor: businessDepositWhileOpen(booking),
    businessName: booking.business_name,
    currency: booking.currency,
    cutoffHours: booking.cancel_cutoff_hours,
    dueMinor: booking.deposit_minor,
    nonRefundable: booking.deposit_non_refundable === true,
    priceMinor: booking.price_minor,
  };
}

type Mode = "view" | "reschedule" | "confirm-cancel";

export function ManageBooking({
  actions,
  booking: initial,
  calendarHref,
  token,
}: ManageBookingProps) {
  const [booking, setBooking] = useState(initial);
  const [mode, setMode] = useState<Mode>("view");
  const [pick, setPick] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active = ACTIVE.has(booking.status);
  const editable = active && booking.can_cancel;

  const run = async (
    work: () => Promise<Outcome<BookingPublicDetail>>,
    onDone: string
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const outcome = await work();
      if (outcome.ok) {
        setBooking(outcome.data);
        setMode("view");
        setPick(null);
        setReason("");
        setNotice(onDone);
        return;
      }
      setError(outcome.message);
      if (outcome.code === "slot_taken") {
        setPick(null);
        setReloadKey((n) => n + 1);
      }
      if (outcome.code === "cutoff") {
        setBooking((current) => ({ ...current, can_cancel: false }));
        setMode("view");
      }
    } catch {
      setError(NETWORK_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  const load = (firstDay: string): Promise<Outcome<SlotList>> =>
    actions.loadSlots(token, firstDay);

  return (
    <article className="manage">
      <h2>
        {booking.service_name}{" "}
        <span className={`status status-${booking.status}`}>
          {paymentReceivedHeld(booking.status, booking.payment)
            ? "Payment received, confirming your booking"
            : (STATUS_TEXT[booking.status] ?? booking.status)}
        </span>
      </h2>
      <dl className="summary">
        <div>
          <dt>When</dt>
          <dd>{formatDateTime(booking.starts_at, booking.timezone)}</dd>
        </div>
        <div>
          <dt>With</dt>
          <dd>{booking.provider_name}</dd>
        </div>
        <div>
          <dt>Name</dt>
          <dd>{booking.customer_name}</dd>
        </div>
        <BookedAddOns currency={booking.currency} lines={booking.add_ons} />
        <div>
          <dt>{booking.add_ons?.length ? "Total" : "Price"}</dt>
          <dd>{formatMoney(booking.price_minor, booking.currency)}</dd>
        </div>
      </dl>
      {booking.payment && (
        <PaymentStatus bookingId={booking.id} payment={booking.payment} />
      )}
      {booking.status === "pending_payment" && booking.hold_ends_at ? (
        <p>{holdEndsLine(booking.hold_ends_at, booking.timezone)}</p>
      ) : null}
      <BookedExtras
        booking={booking}
        currency={booking.currency}
        withNewClients={active}
      />
      <BookingRules
        lateFee={lateFeeWhileActive(booking)}
        policy={booking.booking_policy}
        rules={manageRules(booking)}
        showRules={editable}
      />

      {notice && (
        <p className="notice notice-ok" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="notice notice-error" role="alert">
          <p>{error}</p>
          {tellsToContact(error) && <ContactLinks contact={booking.contact} />}
        </div>
      )}

      {active && !booking.can_cancel && (
        <div className="notice">
          <p>
            Changes close {formatHours(booking.cancel_cutoff_hours)} before your
            appointment. To change or cancel now, please contact{" "}
            {booking.business_name?.trim() || "the business"}
            {contactEnding(booking.contact)}
          </p>
          <ContactLinks contact={booking.contact} />
        </div>
      )}

      {active && (
        <p>
          <a className="btn" download href={calendarHref}>
            Add to calendar
          </a>
        </p>
      )}

      {editable && mode === "view" && (
        <div className="actions">
          <button
            className="btn btn-solid"
            onClick={() => {
              setError(null);
              setNotice(null);
              setMode("reschedule");
            }}
            type="button"
          >
            Change time
          </button>
          <button
            className="btn"
            onClick={() => {
              setError(null);
              setNotice(null);
              setMode("confirm-cancel");
            }}
            type="button"
          >
            Cancel booking
          </button>
        </div>
      )}

      {editable && mode === "confirm-cancel" && (
        <fieldset className="notice confirm">
          <legend className="sr-only">Confirm cancellation</legend>
          <p>
            <strong>Cancel this booking?</strong> This frees the time for
            someone else. We will email you a confirmation.
          </p>
          <div className="field">
            <label htmlFor="cancel-reason">
              Reason for cancelling (optional)
            </label>
            <textarea
              aria-describedby="cancel-reason-hint"
              disabled={busy}
              id="cancel-reason"
              maxLength={REASON_MAX}
              name="cancel-reason"
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              value={reason}
            />
            <p className="hint" id="cancel-reason-hint">
              The business sees this reason. Leave it blank if you prefer.
            </p>
          </div>
          <div className="actions">
            <button
              className="btn btn-solid"
              disabled={busy}
              onClick={() =>
                run(
                  () => actions.cancel(token, reason.trim() || null),
                  CANCELLED_NOTICE
                )
              }
              type="button"
            >
              {busy ? "Cancelling…" : "Yes, cancel my booking"}
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => {
                setReason("");
                setMode("view");
              }}
              type="button"
            >
              Keep my booking
            </button>
          </div>
        </fieldset>
      )}

      {editable && mode === "reschedule" && (
        <section aria-labelledby="move-title" className="step">
          <h3 id="move-title">Choose a new time</h3>
          <SlotPicker
            load={load}
            onChange={setPick}
            reloadKey={reloadKey}
            timeZone={booking.timezone}
            value={pick}
          />
          <div className="actions">
            <button
              className="btn btn-solid"
              disabled={busy || !pick}
              onClick={() => {
                if (pick) {
                  run(
                    () => actions.reschedule(token, pick),
                    "Your booking has moved."
                  );
                }
              }}
              type="button"
            >
              {busy ? "Moving…" : "Move my booking"}
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => setMode("view")}
              type="button"
            >
              Never mind
            </button>
          </div>
        </section>
      )}

      {booking.account_invite_url && (
        <section aria-labelledby="manage-invite" className="notice">
          <h2 id="manage-invite">Keep your bookings in one place</h2>
          <p>
            Create a free Barrels account, or sign in with the same email
            address, so your bookings with this business can be listed under My
            bookings.
          </p>
          <p>
            <a className="btn" href={booking.account_invite_url}>
              Create an account or sign in
            </a>
          </p>
        </section>
      )}
    </article>
  );
}
