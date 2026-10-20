"use client";

import type { BookingPublicDetail } from "@barrelsgd/api-client";
import { useState } from "react";
import type { SlotList } from "@/app/book/actions";
import {
  cancelMyBooking,
  loadRescheduleSlots,
  rescheduleMyBooking,
} from "@/app/booking/[token]/actions";
import { INSTAGRAM_DM_URL } from "@/data/site";
import type { Outcome } from "@/lib/booking-errors";
import { formatDateTime, formatMoney } from "@/lib/booking-format";
import { SlotPicker } from "./slot-picker";

interface ManageBookingProps {
  booking: BookingPublicDetail;
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

type Mode = "view" | "reschedule" | "confirm-cancel";

export function ManageBooking({ booking: initial, token }: ManageBookingProps) {
  const [booking, setBooking] = useState(initial);
  const [mode, setMode] = useState<Mode>("view");
  const [pick, setPick] = useState<string | null>(null);
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
    loadRescheduleSlots(token, firstDay);

  return (
    <article className="manage">
      <h2>
        {booking.service_name}{" "}
        <span className={`status status-${booking.status}`}>
          {STATUS_TEXT[booking.status] ?? booking.status}
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
        <div>
          <dt>Price</dt>
          <dd>{formatMoney(booking.price_minor)}</dd>
        </div>
      </dl>

      {notice && (
        <p className="notice notice-ok" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      {active && !booking.can_cancel && (
        <p className="notice">
          Changes close {booking.cancel_cutoff_hours} hours before your
          appointment. To change or cancel now, please{" "}
          <a href={INSTAGRAM_DM_URL} rel="noopener" target="_blank">
            message us on Instagram
          </a>
          .
        </p>
      )}

      {active && (
        <p>
          <a className="btn btn-ghost" download href={`/booking/${token}/ics`}>
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
            className="btn btn-ghost"
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
          <p>Cancel this booking? This frees the time for someone else.</p>
          <div className="actions">
            <button
              className="btn btn-solid"
              disabled={busy}
              onClick={() =>
                run(() => cancelMyBooking(token), "Your booking is cancelled.")
              }
              type="button"
            >
              {busy ? "Cancelling…" : "Yes, cancel it"}
            </button>
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => setMode("view")}
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
                    () => rescheduleMyBooking(token, pick),
                    "Your booking has moved."
                  );
                }
              }}
              type="button"
            >
              {busy ? "Moving…" : "Move my booking"}
            </button>
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => setMode("view")}
              type="button"
            >
              Never mind
            </button>
          </div>
        </section>
      )}
    </article>
  );
}
