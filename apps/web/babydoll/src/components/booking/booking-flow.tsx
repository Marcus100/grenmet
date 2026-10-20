"use client";

import type {
  BookingPublicService,
  BookingStorefront,
} from "@barrelsgd/api-client";
import Link from "next/link";
import { type RefObject, useEffect, useRef, useState } from "react";
import { type Booked, loadSlots, submitBooking } from "@/app/book/actions";
import {
  type FieldErrors,
  type FieldKey,
  fingerprint,
  validateBooking,
} from "@/lib/booking-form";
import {
  formatDateTime,
  formatDuration,
  formatMoney,
} from "@/lib/booking-format";
import { SlotPicker } from "./slot-picker";
import { Turnstile } from "./turnstile";

interface BookingFlowProps {
  storefront: BookingStorefront;
  /** Cloudflare Turnstile public key; empty means no widget. */
  turnstileSiteKey: string;
}

const NETWORK_MESSAGE =
  "We couldn't reach the booking service. Nothing was lost: press Book again to retry safely.";

const FIELD_IDS: Record<FieldKey, string> = {
  service: "book-service",
  time: "book-time",
  name: "book-name",
  email: "book-email",
  phone: "book-phone",
  notes: "book-notes",
};

function byCategory(services: BookingPublicService[]) {
  const groups = new Map<string, BookingPublicService[]>();
  for (const service of services) {
    const key = service.category ?? "Services";
    groups.set(key, [...(groups.get(key) ?? []), service]);
  }
  return [...groups];
}

function statusLine(status: string): string {
  if (status === "confirmed") {
    return "Your appointment is confirmed.";
  }
  return "Your request is in. The studio will confirm it by email.";
}

/** Moves focus to an element when it appears (error summary, confirmation). */
function useFocusWhen(ref: RefObject<HTMLElement | null>, when: boolean): void {
  useEffect(() => {
    if (when) {
      ref.current?.focus();
    }
  }, [ref, when]);
}

/** The confirmation: focus lands on its heading so screen readers announce it. */
function BookingDone({ booked }: { booked: Booked }) {
  const { booking, manageToken } = booked;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusWhen(headingRef, true);
  return (
    <section aria-labelledby="book-done" className="notice notice-ok">
      <h2 id="book-done" ref={headingRef} tabIndex={-1}>
        Thank you, {booking.customer_name.split(" ")[0]}
      </h2>
      <p>{statusLine(booking.status)}</p>
      <dl className="summary">
        <div>
          <dt>Service</dt>
          <dd>{booking.service_name}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>{formatDateTime(booking.starts_at, booking.timezone)}</dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd>{formatMoney(booking.price_minor)}</dd>
        </div>
      </dl>
      <p>
        <strong>Keep this link.</strong> It lets you see, change or cancel your
        booking, and it is shown only once. We also send it to your email.
      </p>
      <p>
        <Link className="btn btn-solid" href={`/booking/${manageToken}`}>
          Manage my booking
        </Link>
      </p>
    </section>
  );
}

interface TextFieldProps {
  autoComplete?: string;
  error: string | undefined;
  id: string;
  inputMode?: "email" | "tel";
  label: string;
  maxLength: number;
  multiline?: boolean;
  name: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: "email" | "tel";
  value: string;
}

/** A labelled field whose error is announced with the input (aria-describedby). */
function TextField({
  error,
  id,
  label,
  multiline,
  onChange,
  ...rest
}: TextFieldProps) {
  const errorId = `${id}-error`;
  const shared = {
    "aria-describedby": error ? errorId : undefined,
    "aria-invalid": Boolean(error),
    id,
    maxLength: rest.maxLength,
    name: rest.name,
    value: rest.value,
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          {...shared}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      ) : (
        <input
          {...shared}
          autoComplete={rest.autoComplete}
          inputMode={rest.inputMode}
          onChange={(e) => onChange(e.target.value)}
          required={rest.required}
          type={rest.type}
        />
      )}
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

export function BookingFlow({
  storefront,
  turnstileSiteKey,
}: BookingFlowProps) {
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [website, setWebsite] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState<Booked | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  // One key per submission: a retry of the same request replays it.
  const attempt = useRef<{ print: string; key: string } | null>(null);

  const service = storefront.services.find((s) => s.id === serviceId) ?? null;
  const errorList = (Object.keys(errors) as FieldKey[]).filter(
    (key) => errors[key]
  );
  const showSummary = errorList.length > 0 || formError !== null;

  useFocusWhen(summaryRef, showSummary);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    const found = validateBooking({
      serviceId,
      startsAt,
      name,
      email,
      phone,
      notes,
    });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0 || !serviceId || !startsAt) {
      return;
    }
    if (turnstileSiteKey && !token) {
      setFormError(
        "Verification is still loading. Please wait a moment and try again."
      );
      return;
    }
    const print = fingerprint({
      serviceId,
      startsAt,
      name,
      email,
      phone,
      notes,
      marketing,
    });
    if (attempt.current?.print !== print) {
      attempt.current = { print, key: crypto.randomUUID() };
    }
    setSubmitting(true);
    try {
      const outcome = await submitBooking({
        idempotencyKey: attempt.current.key,
        serviceId,
        startsAt,
        name,
        email,
        phone,
        notes,
        marketingConsent: marketing,
        website,
        turnstileToken: token ?? "",
      });
      if (outcome.ok) {
        attempt.current = null;
        setBooked(outcome.data);
        return;
      }
      setFormError(outcome.message);
      if (outcome.code === "slot_taken") {
        setStartsAt(null);
        setReloadKey((n) => n + 1);
      }
    } catch {
      // The request may or may not have reached the API; the same key is kept.
      setFormError(NETWORK_MESSAGE);
    } finally {
      setSubmitting(false);
      // Turnstile tokens are single-use.
      setResetKey((n) => n + 1);
    }
  };

  if (booked) {
    return <BookingDone booked={booked} />;
  }

  return (
    <form
      aria-label="Book an appointment"
      className="book-form"
      noValidate
      onSubmit={submit}
    >
      {showSummary && (
        <div
          aria-labelledby="book-errors-title"
          className="notice notice-error"
          ref={summaryRef}
          role="alert"
          tabIndex={-1}
        >
          <h2 id="book-errors-title">
            {errorList.length > 0
              ? "Please fix the following"
              : "We couldn't book that"}
          </h2>
          {errorList.length > 0 && (
            <ul>
              {errorList.map((key) => (
                <li key={key}>
                  <a href={`#${FIELD_IDS[key]}`}>{errors[key]}</a>
                </li>
              ))}
            </ul>
          )}
          {formError && <p>{formError}</p>}
        </div>
      )}

      <fieldset className="step" id={FIELD_IDS.service}>
        <legend>1. Choose a service</legend>
        {errors.service && <p className="field-error">{errors.service}</p>}
        {byCategory(storefront.services).map(([category, list]) => (
          <div className="service-group" key={category}>
            <h3>{category}</h3>
            {list.map((item) => (
              <label className="service-option" key={item.id}>
                <input
                  checked={item.id === serviceId}
                  name="service"
                  onChange={() => {
                    setServiceId(item.id);
                    setStartsAt(null);
                  }}
                  type="radio"
                  value={item.id}
                />
                <span className="service-text">
                  <span className="service-name">{item.name}</span>
                  <span className="muted">
                    {formatDuration(item.duration_min)}
                    {item.description ? ` · ${item.description}` : ""}
                  </span>
                </span>
                <span className="service-price">
                  {formatMoney(item.price_minor)}
                </span>
              </label>
            ))}
          </div>
        ))}
        {storefront.services.length === 0 && (
          <p className="muted">
            No services are open for online booking yet. Please message us on
            Instagram.
          </p>
        )}
      </fieldset>

      <fieldset className="step" id={FIELD_IDS.time}>
        <legend>2. Pick a day and time</legend>
        <p className="muted">
          Times are in {storefront.timezone.replace("_", " ")} time.
        </p>
        {errors.time && <p className="field-error">{errors.time}</p>}
        {service ? (
          <SlotPicker
            key={service.id}
            load={(firstDay) => loadSlots(service.id, firstDay)}
            onChange={setStartsAt}
            reloadKey={reloadKey}
            timeZone={storefront.timezone}
            value={startsAt}
          />
        ) : (
          <p className="muted">Choose a service to see open times.</p>
        )}
        {service && startsAt && (
          <p className="chosen" role="status">
            {service.name}: {formatDateTime(startsAt, storefront.timezone)}
          </p>
        )}
      </fieldset>

      <fieldset className="step">
        <legend>3. Your details</legend>
        <TextField
          autoComplete="name"
          error={errors.name}
          id={FIELD_IDS.name}
          label="Name"
          maxLength={120}
          name="name"
          onChange={setName}
          required
          value={name}
        />
        <TextField
          autoComplete="email"
          error={errors.email}
          id={FIELD_IDS.email}
          inputMode="email"
          label="Email"
          maxLength={254}
          name="email"
          onChange={setEmail}
          required
          type="email"
          value={email}
        />
        <TextField
          autoComplete="tel"
          error={errors.phone}
          id={FIELD_IDS.phone}
          inputMode="tel"
          label="Phone (optional)"
          maxLength={40}
          name="phone"
          onChange={setPhone}
          type="tel"
          value={phone}
        />
        <TextField
          error={errors.notes}
          id={FIELD_IDS.notes}
          label="Anything we should know? (optional)"
          maxLength={1000}
          multiline
          name="notes"
          onChange={setNotes}
          value={notes}
        />
        <label className="check">
          <input
            checked={marketing}
            name="marketing"
            onChange={(e) => setMarketing(e.target.checked)}
            type="checkbox"
          />
          <span>
            Send me news and offers from Babydoll Beauty Bar. (Optional. We will
            always email you about this booking.)
          </span>
        </label>

        {/* Honeypot: people never see or fill it; a bot that does is dropped. */}
        <div aria-hidden="true" className="hp">
          <label>
            Leave this field empty
            <input
              autoComplete="off"
              name="website"
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              type="text"
              value={website}
            />
          </label>
        </div>

        <Turnstile
          onToken={setToken}
          resetKey={resetKey}
          siteKey={turnstileSiteKey}
        />
      </fieldset>

      <p className="muted">
        By appointment only. You can change or cancel online until{" "}
        {storefront.cancel_cutoff_hours} hours before your visit.
      </p>
      <button
        aria-disabled={submitting}
        className="btn btn-solid"
        disabled={submitting}
        type="submit"
      >
        {submitting ? "Booking…" : "Request my booking"}
      </button>
    </form>
  );
}
