"use client";

import type {
  BookingPublicService,
  BookingStorefront,
} from "@barrelsgd/api-client";
import {
  type ComponentType,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addOnTotals,
  amountDueForSelection,
  selectionKey,
} from "../lib/add-ons";
import {
  clearBookingDetails,
  readBookingDetails,
  type SavedDetails,
  saveBookingDetails,
} from "../lib/booking-details-store";
import {
  ADD_ONS_GONE_MESSAGE,
  ADD_ONS_TIMES_MESSAGE,
  type Failure,
  type Outcome,
  tellsToContact,
} from "../lib/booking-errors";
import { businessDepositOf, lateFeeLine } from "../lib/booking-extras";
import {
  type BookingFields,
  type FieldErrors,
  type FieldKey,
  fingerprint,
  sameEmail,
  stillWrong,
  validateBooking,
} from "../lib/booking-form";
import {
  formatDateTime,
  formatDuration,
  formatMoney,
  localDay,
  timeZonePlace,
} from "../lib/booking-format";
import { withChoices } from "../lib/booking-link";
import { payNowLine } from "../lib/booking-payment";
import { cancellationPolicyLine, holdEndsLine } from "../lib/booking-policy";
import type {
  Booked,
  BookingFlowActions,
  BookingInput,
} from "../lib/booking-types";
import { contactEnding } from "../lib/business-contact";
import { AddOnStep, BookedAddOns } from "./add-on-step";
import { BookedExtras } from "./booking-extras";
import { BookingRules } from "./booking-policy-text";
import {
  ChosenTrail,
  chosenSummary,
  chosenTrail,
  StepBar,
  StepHeader,
  StepPane,
} from "./booking-steps";
import { ContactLinks } from "./business-contact";
import { DepositToBusiness } from "./business-deposit";
import { NewClientsNote } from "./new-clients-note";
import { PausedNotice } from "./paused-notice";
import { PaymentStatus } from "./payment-status";
import { ServiceList } from "./service-list";
import { SlotPicker } from "./slot-picker";
import { Turnstile } from "./turnstile";
import { useAddOns } from "./use-add-ons";
import { onPhone, useBookingSteps } from "./use-booking-steps";
import {
  CODE_LENGTH,
  TOKEN_LOADING_MESSAGE,
  useEmailCode,
} from "./use-email-code";

/** What the API said is due for one selection (service plus add-ons). */
interface Quote {
  dueMinor: number | undefined;
  emailCodeRequired: boolean | undefined;
  key: string;
}

const ADD_ON_FAILURES: ReadonlySet<string> = new Set([
  "add_ons_unavailable",
  "not_found",
  "invalid",
]);

const TIMES_UPDATING =
  "Your times are updating for the add-ons you chose. Please wait a moment, then try again.";

/** A link component the host can supply (e.g. a router-aware link). */
export interface BookingLinkProps {
  children: ReactNode;
  className?: string;
  href: string;
}

export type BookingLink = ComponentType<BookingLinkProps>;

/** Default link: a plain anchor. Hosts with client-side routing pass their own. */
function PlainLink({ children, className, href }: BookingLinkProps) {
  return (
    <a className={className} href={href}>
      {children}
    </a>
  );
}

/** Where a guest can create a free account; the host passes it only to guests. */
export interface AccountInvite {
  href: string;
}

/** A signed-in visitor's own details, prefilled and still editable. */
export interface SignedInVisitor {
  email: string;
  /** The account's name; may be empty, in which case the email is shown. */
  name: string;
  phone: string;
  /** Where the "Sign out" button posts to (the host's own sign-out route). */
  signOutAction: string;
}

/** A service the signed-in visitor booked here before, and the provider used last. */
export interface BookAgainChoice {
  providerId: string;
  serviceId: string;
}

/** Funnel steps the host may record (cookieless analytics). Ids only. */
export type BookingTrackEvent =
  | "service_selected"
  | "slot_selected"
  | "booking_submitted"
  | "booking_confirmed";

export interface BookingTrackProperties {
  service_id?: string;
}

export interface BookingFlowProps {
  /**
   * An invitation shown after booking to a visitor who is not signed in. Never
   * blocks a booking. Omit it for a signed-in visitor.
   */
  accountInvite?: AccountInvite;
  /** Server calls for slots and submission, passed in by the host app. */
  actions: BookingFlowActions;
  /**
   * The visitor's own earlier choices with this business, most recent first.
   * Shown as shortcuts above the full service list, which stays. Only for a
   * signed-in visitor; entries the business no longer offers are skipped.
   */
  bookAgain?: BookAgainChoice[];
  /**
   * The day (YYYY-MM-DD) from the page's `?day=` link. Used only with a linked
   * service; a day in the past is ignored by the picker.
   */
  initialDay?: string;
  /**
   * A service to start with (the page's `?service=` link). Ignored unless the
   * business offers it. It is chosen and expanded on step 1; nothing moves on
   * by itself.
   */
  initialServiceId?: string;
  /**
   * The start (ISO 8601) from the page's `?time=` link. Used only with a linked
   * service; if the business no longer has that time, the flow clears it and
   * says so.
   */
  initialStartsAt?: string;
  /** Link used for the manage link on the confirmation. Defaults to an anchor. */
  ManageLink?: BookingLink;
  /** Path the manage link goes to; the token is appended as `/<token>`. */
  managePath: string;
  /**
   * Set for a signed-in visitor: the form starts with their details and says
   * who they are booking as. Never set it from anyone else's data. Guests get a
   * blank form.
   */
  signedIn?: SignedInVisitor;
  /** The business's page, including its own contact options (`contact`). */
  storefront: BookingStorefront;
  /** The studio's name, used in the marketing opt-in wording. */
  studioName: string;
  /**
   * Records a funnel step. The host binds its app and business slug and sends
   * nothing else. Omit it to record nothing.
   */
  track?: (
    event: BookingTrackEvent,
    properties: BookingTrackProperties
  ) => void;
  /** Cloudflare Turnstile public key; empty means no widget. */
  turnstileSiteKey: string;
}

const NETWORK_MESSAGE =
  "We couldn't reach the booking service. Nothing was lost: press Book again to retry safely.";

/** Said when a time remembered from the page's link is no longer offered. */
const TIME_GONE_MESSAGE =
  "Your earlier time is no longer available. Choose another time.";

const FIELD_IDS: Record<FieldKey, string> = {
  service: "book-service",
  time: "book-time",
  name: "book-name",
  email: "book-email",
  phone: "book-phone",
  notes: "book-notes",
};

const CODE_ID = "book-code";

function buttonLabel(
  submitting: boolean,
  codeBusy: "send" | "verify" | null,
  needsCode: boolean
): string {
  if (submitting) {
    return "Booking…";
  }
  if (codeBusy) {
    return "Sending code…";
  }
  return needsCode ? "Email me a verification code" : "Request my booking";
}

function statusLine(status: string): string {
  if (status === "confirmed") {
    return "Your appointment is confirmed.";
  }
  if (status === "pending_payment") {
    return "Your time is held while you pay. It is released if the payment does not arrive in time.";
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
function BookingDone({
  accountInvite,
  booked,
  currency,
  ManageLink,
  managePath,
  studioName,
}: {
  accountInvite: AccountInvite | undefined;
  booked: Booked;
  /** The business currency; the receipt does not carry one. */
  currency: string;
  ManageLink: BookingLink;
  managePath: string;
  studioName: string;
}) {
  const { booking, manageToken } = booked;
  const lateFee = lateFeeLine(booking.late_fee, currency);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusWhen(headingRef, true);
  return (
    <div className="book-done">
      <section aria-labelledby="book-done" className="notice notice-ok">
        <svg
          aria-hidden="true"
          className="book-tick"
          focusable="false"
          height="40"
          viewBox="0 0 40 40"
          width="40"
        >
          <circle cx="20" cy="20" fill="none" r="18" strokeWidth="2.5" />
          <path d="M11 21l6 6 12-13" fill="none" strokeWidth="3" />
        </svg>
        <h2 id="book-done" ref={headingRef} tabIndex={-1}>
          Thank you, {booking.customer_name.split(" ")[0]}
        </h2>
        <p>{statusLine(booking.status)}</p>
        {booking.status === "pending_payment" && booking.hold_ends_at ? (
          <p>
            {holdEndsLine(
              booking.hold_ends_at,
              booking.timezone,
              booking.hold_minutes
            )}
          </p>
        ) : null}
        <p>{cancellationPolicyLine(booking.cancel_cutoff_hours)}</p>
        {lateFee ? <p className="book-late-fee">{lateFee}</p> : null}
        <dl className="summary">
          <div>
            <dt>Service</dt>
            <dd>{booking.service_name}</dd>
          </div>
          <div>
            <dt>When</dt>
            <dd>{formatDateTime(booking.starts_at, booking.timezone)}</dd>
          </div>
          <BookedAddOns currency={currency} lines={booking.add_ons} />
          <div>
            <dt>{booking.add_ons?.length ? "Total" : "Price"}</dt>
            <dd>{formatMoney(booking.price_minor, currency)}</dd>
          </div>
        </dl>
        {booking.payment && (
          <PaymentStatus
            bookingId={booking.id}
            managePath={`${managePath}/${manageToken}`}
            payment={booking.payment}
          />
        )}
        <BookedExtras booking={booking} currency={currency} withNewClients />
        <p>
          <strong>Keep this link.</strong> It lets you see, change or cancel
          your booking, and it is shown only once. We also send it to your
          email.
        </p>
        <p>
          <ManageLink
            className="btn btn-solid"
            href={`${managePath}/${manageToken}`}
          >
            Manage my booking
          </ManageLink>
        </p>
      </section>
      {accountInvite && (
        <section aria-labelledby="book-invite" className="notice">
          <h2 id="book-invite">Keep your bookings in one place</h2>
          <p>
            Booking never needs an account. If you would like one, it is free:
            create a Barrels account, or sign in if you already have one, using
            the same email address you used here. When you are signed in and
            book with {studioName}, your bookings with them, including this one,
            are listed under My bookings.
          </p>
          <p>
            <a className="btn" href={accountInvite.href}>
              Create an account or sign in
            </a>
          </p>
        </section>
      )}
    </div>
  );
}

/** Who the booking is for, with the way out when it is the wrong person. */
function SignedInLine({ signedIn }: { signedIn: SignedInVisitor }) {
  return (
    <div className="signed-in-as">
      <span>
        Booking as <strong>{signedIn.name || signedIn.email}</strong>. Not you?
      </span>
      <form action={signedIn.signOutAction} method="post">
        <button className="link-button" type="submit">
          Sign out
        </button>
      </form>
    </div>
  );
}

/**
 * Shortcuts to what the visitor booked here before, above the full service
 * list (which stays). A choice whose service the business no longer offers is
 * skipped. The provider is shown as history ("last time with ...") only when
 * the business has more than one, because the flow lets the business assign it.
 */
function BookAgain({
  choices,
  onChoose,
  selected,
  storefront,
}: {
  choices: BookAgainChoice[];
  onChoose: (serviceId: string) => void;
  selected: string | null;
  storefront: BookingStorefront;
}) {
  const items = choices.flatMap((choice) => {
    const service = storefront.services.find((s) => s.id === choice.serviceId);
    if (!service) {
      return [];
    }
    const provider = storefront.providers.find(
      (p) => p.id === choice.providerId && p.service_ids.includes(service.id)
    );
    return [{ provider, service }];
  });
  if (items.length === 0) {
    return null;
  }
  const namesProvider = storefront.providers.length > 1;
  return (
    <div className="book-again">
      <h3 id="book-again-title">Book again</h3>
      <ul aria-labelledby="book-again-title" className="book-again-list">
        {items.map(({ provider, service }) => (
          <li key={service.id}>
            <button
              aria-pressed={service.id === selected}
              className="btn book-again-choice"
              onClick={() => onChoose(service.id)}
              type="button"
            >
              <span className="service-name">{service.name}</span>
              <span className="muted">
                {formatDuration(service.duration_min)} ·{" "}
                {formatMoney(service.price_minor, storefront.currency)}
                {namesProvider && provider
                  ? ` · last time with ${provider.name}`
                  : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The id of a radio group's error line, or nothing when it has no error. */
function groupErrorId(
  field: "service" | "time",
  errors: FieldErrors
): string | undefined {
  return errors[field] ? `${FIELD_IDS[field]}-error` : undefined;
}

/** A radio group's error, read out with the group through aria-describedby. */
function GroupError({
  errors,
  field,
}: {
  errors: FieldErrors;
  field: "service" | "time";
}) {
  const message = errors[field];
  return message ? (
    <p className="field-error" id={groupErrorId(field, errors)}>
      {message}
    </p>
  ) : null;
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
          spellCheck={rest.type === "email" ? false : undefined}
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

interface CodePanelProps {
  busy: "send" | "verify" | null;
  code: string;
  cooldown: number;
  email: string;
  error: string | null;
  notice: string | null;
  onChangeEmail: () => void;
  onCode: (value: string) => void;
  onResend: () => void;
  resendBlocked: boolean;
}

/** The emailed-code step: input, verify, resend with a cooldown, change email. */
function CodePanel({
  busy,
  code,
  cooldown,
  email,
  error,
  notice,
  onChangeEmail,
  onCode,
  onResend,
  resendBlocked,
}: CodePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <fieldset className="step code-step" id={CODE_ID}>
      <legend>4. Check your email</legend>
      <p>
        We emailed a {CODE_LENGTH}-digit code to <strong>{email.trim()}</strong>
        . It can take a minute to arrive, and it works for 10 minutes. Check
        your spam folder if you can't see it.
      </p>
      <div className="field">
        <label htmlFor={`${CODE_ID}-input`}>Verification code</label>
        <input
          aria-describedby={error ? `${CODE_ID}-error` : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="one-time-code"
          className="code-input"
          id={`${CODE_ID}-input`}
          inputMode="numeric"
          name="email-code"
          onChange={(e) => onCode(e.target.value)}
          pattern="[0-9]*"
          ref={inputRef}
          spellCheck={false}
          type="text"
          value={code}
        />
        {error && (
          <p className="field-error" id={`${CODE_ID}-error`} role="alert">
            {error}
          </p>
        )}
      </div>
      <p className="muted" role="status">
        {notice}
      </p>
      <div className="code-actions">
        <button
          aria-disabled={busy !== null}
          className="btn btn-solid"
          disabled={busy !== null}
          type="submit"
        >
          {busy === "verify" ? "Checking…" : "Verify code"}
        </button>
        <button
          className="btn"
          disabled={resendBlocked}
          onClick={onResend}
          type="button"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
        <button className="btn" onClick={onChangeEmail} type="button">
          Change email
        </button>
      </div>
    </fieldset>
  );
}

/**
 * What a submit does next: stop on an invalid form, ask for the emailed code
 * first, wait for the Turnstile token, or send the booking with its chosen
 * service and time (narrowed here, so the request types them as strings).
 */
type SubmitGate =
  | { kind: "stop" }
  | { kind: "code" }
  | { kind: "token" }
  | { kind: "send"; serviceId: string; startsAt: string };

function submitGate(input: {
  found: FieldErrors;
  serviceId: string | null;
  startsAt: string | null;
  needsCode: boolean;
  isVerified: boolean;
  tokenMissing: boolean;
}): SubmitGate {
  if (
    Object.keys(input.found).length > 0 ||
    !input.serviceId ||
    !input.startsAt
  ) {
    return { kind: "stop" };
  }
  if (input.needsCode && !input.isVerified) {
    return { kind: "code" };
  }
  if (input.tokenMissing) {
    return { kind: "token" };
  }
  return { kind: "send", serviceId: input.serviceId, startsAt: input.startsAt };
}

/** The idempotency attempt for a submission: the same request keeps its key, a changed one gets a new key. */
function attemptFor(
  previous: { print: string; key: string } | null,
  print: string
): { print: string; key: string } {
  return previous?.print === print
    ? previous
    : { print, key: crypto.randomUUID() };
}

/** The request body; the emailed-code proof is sent only when one was verified. */
function requestInput(
  base: Omit<BookingInput, "emailProof">,
  proof: string | null
): BookingInput {
  return proof ? { ...base, emailProof: proof } : base;
}

/** The error summary above the form: links to the fields, the form message and contact links. */
function ErrorSummary({
  contact,
  errorList,
  errors,
  formError,
  summaryRef,
}: {
  contact: BookingStorefront["contact"];
  errorList: FieldKey[];
  errors: FieldErrors;
  formError: string | null;
  summaryRef: RefObject<HTMLDivElement | null>;
}) {
  return (
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
      {tellsToContact(formError) && <ContactLinks contact={contact} />}
    </div>
  );
}

/** Step 1: the service choice. */
function ServicesStep({
  addOnsChosen,
  bookAgain,
  errors,
  onPick,
  selectedId,
  storefront,
}: {
  /** Add-ons are ticked: the total is only known on step 3, so the details say no amount. */
  addOnsChosen: boolean;
  bookAgain: BookAgainChoice[];
  errors: FieldErrors;
  onPick: (serviceId: string) => void;
  selectedId: string | null;
  storefront: BookingStorefront;
}) {
  return (
    <fieldset
      aria-describedby={groupErrorId("service", errors)}
      className="step"
      id={FIELD_IDS.service}
    >
      <legend>1. Choose a service</legend>
      <GroupError errors={errors} field="service" />
      <BookAgain
        choices={bookAgain}
        onChoose={onPick}
        selected={selectedId}
        storefront={storefront}
      />
      <ServiceList
        addOnsChosen={addOnsChosen}
        bookAgainIds={bookAgain.map((choice) => choice.serviceId)}
        onPick={onPick}
        selectedId={selectedId}
        services={storefront.services}
        storefront={storefront}
      />
      {storefront.services.length === 0 && (
        <div className="muted">
          <p>
            No services are open for online booking yet. Please contact the
            business{contactEnding(storefront.contact)}
          </p>
          <ContactLinks contact={storefront.contact} />
        </div>
      )}
    </fieldset>
  );
}

/** Step 2: the day and time, once a service is chosen. */
function TimeStep({
  actions,
  addOnIds,
  errors,
  initialDay,
  onAddOnsGone,
  onBusyChange,
  currentKey,
  onChange,
  onDayChange,
  onQuote,
  onUnavailable,
  reloadKey,
  service,
  startsAt,
  storefront,
  timeNote,
}: {
  actions: BookingFlowActions;
  addOnIds: readonly string[];
  errors: FieldErrors;
  /** The day the flow remembers for this service (YYYY-MM-DD), or null. */
  initialDay: string | null;
  onAddOnsGone: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
  /** The key of the selection on screen now, read when an answer arrives. */
  currentKey: () => string;
  onChange: (value: string | null) => void;
  onDayChange: (day: string | null) => void;
  onQuote: (quote: Quote) => void;
  onUnavailable: () => void;
  reloadKey: number;
  service: BookingPublicService | null;
  startsAt: string | null;
  storefront: BookingStorefront;
  timeNote: string | null;
}) {
  return (
    <fieldset
      aria-describedby={groupErrorId("time", errors)}
      className="step"
      id={FIELD_IDS.time}
    >
      <legend>2. Pick a day and time</legend>
      <p className="muted">
        Times are in {timeZonePlace(storefront.timezone)} time.
      </p>
      <GroupError errors={errors} field="time" />
      {service ? (
        <SlotPicker
          initialDay={initialDay}
          key={service.id}
          load={async (firstDay) => {
            const sentKey = selectionKey(service.id, addOnIds);
            const outcome =
              addOnIds.length > 0
                ? await actions.loadSlots(service.id, firstDay, addOnIds)
                : await actions.loadSlots(service.id, firstDay);
            // A late answer for an older selection must not touch this one.
            if (addOnIds.length > 0 && currentKey() === sentKey) {
              if (outcome.ok) {
                onQuote({
                  key: selectionKey(service.id, addOnIds),
                  dueMinor: outcome.data.dueAtBookingMinor,
                  emailCodeRequired: outcome.data.emailCodeRequired,
                });
              } else if (ADD_ON_FAILURES.has(outcome.code)) {
                // Switched off, not offered with this service, or the service
                // itself cannot take add-ons: drop them, keep what was typed.
                onAddOnsGone(
                  outcome.code === "add_ons_unavailable"
                    ? ADD_ONS_GONE_MESSAGE
                    : ADD_ONS_TIMES_MESSAGE
                );
              }
            }
            return outcome;
          }}
          onBusyChange={onBusyChange}
          onChange={onChange}
          onDayChange={onDayChange}
          onUnavailable={onUnavailable}
          reloadKey={reloadKey}
          timeZone={storefront.timezone}
          value={startsAt}
        />
      ) : (
        <p className="muted">Choose a service to see open times.</p>
      )}
      <div aria-live="polite" data-testid="time-note-live" role="status">
        {timeNote ? <p className="notice">{timeNote}</p> : null}
      </div>
      {service && startsAt && (
        <p className="chosen" role="status">
          {service.name}: {formatDateTime(startsAt, storefront.timezone)}
        </p>
      )}
    </fieldset>
  );
}

/** Shown once the code is verified, or when no code is needed. */
function VerifiedNotice({ proof }: { proof: string | null }) {
  return (
    <p className="notice notice-ok" role="status">
      {proof
        ? "Your email is verified."
        : "No email code is needed for this booking."}{" "}
      Press Request my booking to finish.
    </p>
  );
}

/** The code can be resent only after the cooldown, with no request in flight and a token. */
function codeResendBlocked(
  cooldown: number,
  busy: "send" | "verify" | null,
  tokenMissing: boolean
): boolean {
  return cooldown > 0 || busy !== null || tokenMissing;
}

/**
 * The deposit a business collects by hand, for the chosen service. The service's
 * own deposit ignores add-ons; a business rule works on the combined price, so
 * with add-ons ticked the figure is not known yet and the note says so.
 */
function businessDepositFor(
  storefront: BookingStorefront,
  service: BookingPublicService | null,
  addOnCount: number
): { amountNote?: string; minor: number } | null {
  if (storefront.deposit_collection !== "business" || !service) {
    return null;
  }
  const minor = businessDepositOf(service);
  if (minor <= 0) {
    return null;
  }
  if (addOnCount > 0 && service.deposit_minor <= 0) {
    return {
      minor,
      amountNote:
        "Deposit worked out on the total; you will see the amount when you book.",
    };
  }
  return { minor };
}

/**
 * The money fields of the rules line. While the business deposit waits for the
 * add-on total, no figure is stated: the line then says nothing about money.
 */
function depositRuleFields(
  businessDeposit: { amountNote?: string; minor: number } | null,
  knownDue: number | null
): { businessDepositMinor?: number; dueMinor?: number } {
  if (businessDeposit?.amountNote) {
    return {};
  }
  return {
    businessDepositMinor: businessDeposit?.minor,
    dueMinor: knownDue ?? undefined,
  };
}

/** What is paid online for the chosen service, and its description. */
function ServiceNotes({
  businessDeposit,
  noPayment,
  payNow,
  service,
  storefront,
}: {
  /** The deposit paid to the business by hand, or null (online mode, or none). */
  businessDeposit: { amountNote?: string; minor: number } | null;
  noPayment: boolean;
  payNow: string | null;
  service: BookingPublicService | null;
  storefront: BookingStorefront;
}) {
  return (
    <>
      <div aria-live="polite" role="status">
        {service && payNow && <p className="notice payment-notice">{payNow}</p>}
      </div>
      {service && businessDeposit && (
        <DepositToBusiness
          amountNote={businessDeposit.amountNote}
          businessName={storefront.display_name}
          contact={storefront.contact}
          currency={storefront.currency}
          instructions={storefront.deposit_instructions}
          minor={businessDeposit.minor}
        />
      )}
      {/* On one page the note already sits under the service list. */}
      <NewClientsNote className="book-phone-only" service={service} />
      {service && noPayment && !businessDeposit && (
        <p className="muted">No payment online. You pay when you visit.</p>
      )}
      {service?.description && (
        <p className="muted">
          Note for {service.name}: {service.description}
        </p>
      )}
    </>
  );
}

/**
 * The host's actions, watched: when any answer says the business is paused
 * (409 BUSINESS_PAUSED), the flow swaps itself for the paused notice. The
 * answer itself is passed on unchanged.
 */
function watchPaused(
  actions: BookingFlowActions,
  onPaused: () => void
): BookingFlowActions {
  const watch =
    <Args extends unknown[], T>(call: (...args: Args) => Promise<Outcome<T>>) =>
    async (...args: Args) => {
      const outcome = await call(...args);
      if (!outcome.ok && outcome.code === "paused") {
        onPaused();
      }
      return outcome;
    };
  return {
    confirmEmailCode: watch(actions.confirmEmailCode),
    loadSlots: watch(actions.loadSlots),
    requestEmailCode: watch(actions.requestEmailCode),
    submitBooking: watch(actions.submitBooking),
  };
}

function BookingFlowBody({
  accountInvite,
  actions,
  bookAgain = [],
  initialDay,
  initialServiceId,
  initialStartsAt,
  managePath,
  ManageLink = PlainLink,
  signedIn,
  studioName,
  storefront,
  track,
  turnstileSiteKey,
}: BookingFlowProps) {
  const [serviceId, setServiceId] = useState<string | null>(() =>
    initialServiceId &&
    storefront.services.some((s) => s.id === initialServiceId)
      ? initialServiceId
      : null
  );
  // The day and time come from the page's link only with a service that is
  // still offered; the picker then checks the time against the live list.
  // A remembered time without a day names its own day, so the picker opens there.
  const [day, setDay] = useState<string | null>(() => {
    if (!serviceId) {
      return null;
    }
    if (initialDay) {
      return initialDay;
    }
    return initialStartsAt
      ? localDay(initialStartsAt, storefront.timezone)
      : null;
  });
  const [startsAt, setStartsAt] = useState<string | null>(() =>
    serviceId ? (initialStartsAt ?? null) : null
  );
  // A remembered time the business no longer has: cleared, and said so.
  const [timeGone, setTimeGone] = useState(false);
  const service = storefront.services.find((s) => s.id === serviceId) ?? null;
  const steps = useBookingSteps({
    hasService: service !== null,
    hasTime: startsAt !== null,
    // A linked service is chosen and expanded on step 1; nothing moves on by itself.
    initialStep: 1,
  });
  const { step } = steps;
  const addOns = useAddOns({
    addOns: storefront.add_ons,
    serviceId,
    startsAt,
  });
  const [name, setName] = useState(signedIn?.name ?? "");
  const [email, setEmail] = useState(signedIn?.email ?? "");
  const [phone, setPhone] = useState(signedIn?.phone ?? "");
  const [notes, setNotes] = useState("");
  const [marketing, setMarketing] = useState(false);

  // The choices live in the page's own link (`?service=`, `?day=`, `?time=`),
  // so a reload or a shared link keeps them. Written in place: no history entry.
  // Back and Edit (popstate) can land on an entry whose link was written before
  // the latest choice, so the link is written again then, from the choices held
  // in state.
  useEffect(() => {
    const sync = () => {
      const here = window.location.href;
      const there = withChoices(here, {
        day,
        service: serviceId,
        time: startsAt,
      });
      if (there !== here) {
        window.history.replaceState(window.history.state, "", there);
      }
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [day, serviceId, startsAt]);

  // What was typed comes back after a reload or a trip to sign in (this tab only).
  // Filled fields are left alone, so a signed-in visitor keeps their own details.
  // A signed-in visitor only gets details saved for their own account: on a
  // shared tab, anyone else's are cleared, not shown.
  const signedInEmail = signedIn?.email;
  useEffect(() => {
    const saved = readBookingDetails(storefront.slug);
    if (!saved) {
      return;
    }
    if (signedInEmail !== undefined && !sameEmail(saved.email, signedInEmail)) {
      clearBookingDetails(storefront.slug);
      return;
    }
    setName((value) => value || saved.name);
    setEmail((value) => value || saved.email);
    setPhone((value) => value || saved.phone);
    setNotes((value) => value || saved.notes);
    setMarketing((value) => value || saved.marketing);
  }, [storefront.slug, signedInEmail]);
  const [website, setWebsite] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  // A service the API demanded a code for although the page showed no deposit
  // (a stale page): the next press requests a code instead of resubmitting.
  const [codeForced, setCodeForced] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // True while times are being asked for again after the add-ons changed: a
  // time chosen before that may no longer fit, so it cannot be submitted yet.
  const [timesBusy, setTimesBusy] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const keyRef = useRef("");
  const [booked, setBooked] = useState<Booked | null>(null);
  // Once booked, the typed details are no longer needed in this tab.
  useEffect(() => {
    if (booked) {
      clearBookingDetails(storefront.slug);
    }
  }, [booked, storefront.slug]);
  const summaryRef = useRef<HTMLDivElement>(null);
  // One key per submission: a retry of the same request replays it.
  const attempt = useRef<{ print: string; key: string } | null>(null);

  // Errors come from the last submit and are kept in step with what is typed:
  // a field that is now valid drops its message (see stillWrong), so it does not
  // come back, and focus does not jump to the summary while someone types.
  const fieldsNow: BookingFields = {
    serviceId,
    startsAt,
    name,
    email,
    phone,
    notes,
  };
  const reviseErrors = (change: Partial<BookingFields>) =>
    setErrors((previous) => stillWrong(previous, { ...fieldsNow, ...change }));
  // What is typed so far, kept for this tab (see booking-details-store.ts).
  const keepDetails = (change: Partial<SavedDetails>) =>
    saveBookingDetails(storefront.slug, {
      email,
      marketing,
      name,
      notes,
      phone,
      ...change,
    });
  // Choosing a service never moves the step: the person presses Continue.
  // A different service has its own days and times, so the day is cleared too.
  const pickService = (id: string) => {
    track?.("service_selected", { service_id: id });
    setServiceId(id);
    setDay(null);
    setStartsAt(null);
    setTimeGone(false);
    addOns.reset();
    reviseErrors({ serviceId: id, startsAt: null });
  };
  const pickStart = (value: string | null) => {
    if (value && serviceId) {
      track?.("slot_selected", { service_id: serviceId });
    }
    setStartsAt(value);
    // Clearing a time the business no longer offers keeps the note saying so;
    // only a time actually chosen (or a new day) takes it away.
    if (value) {
      setTimeGone(false);
      addOns.clearNote();
      // The day of a time is the day it was picked from, even when the
      // visitor never pressed a day (the first day with times is the default).
      setDay(localDay(value, storefront.timezone));
    }
    reviseErrors({ startsAt: value });
  };
  const editName = (value: string) => {
    setName(value);
    keepDetails({ name: value });
    reviseErrors({ name: value });
  };
  const editEmail = (value: string) => {
    setEmail(value);
    keepDetails({ email: value });
    reviseErrors({ email: value });
  };
  const editPhone = (value: string) => {
    setPhone(value);
    keepDetails({ phone: value });
    reviseErrors({ phone: value });
  };
  const editNotes = (value: string) => {
    setNotes(value);
    keepDetails({ notes: value });
    reviseErrors({ notes: value });
  };

  const totals = service
    ? addOnTotals(service, addOns.offered, addOns.ids)
    : null;
  const errorList = (Object.keys(errors) as FieldKey[]).filter(
    (key) => errors[key]
  );
  const showSummary = errorList.length > 0 || formError !== null;

  useFocusWhen(summaryRef, showSummary);

  // A signed-in visitor who types their own account email needs no code: the
  // API takes the verified account as the proof (ADR-0018). A refusal from the
  // API still forces the code step (`codeForced`).
  const ownAccountEmail =
    signedIn !== undefined && sameEmail(email, signedIn.email);
  // With add-ons ticked the API may charge on the combined price, which this
  // form cannot work out: then no figure is shown, and a code the API demands
  // anyway is asked for through `codeForced` with the typed details kept.
  keyRef.current = selectionKey(serviceId, addOns.ids);
  const quoted =
    quote?.key === selectionKey(serviceId, addOns.ids) &&
    quote.dueMinor !== undefined &&
    quote.emailCodeRequired !== undefined
      ? { dueMinor: quote.dueMinor, emailCodeRequired: quote.emailCodeRequired }
      : null;
  const selection = service
    ? amountDueForSelection({
        addOnCount: addOns.ids.length,
        fromApi: quoted,
        service,
      })
    : null;
  const knownDue = selection?.dueMinor ?? null;
  const needsCode =
    ((selection?.emailCodeRequired ?? false) && !ownAccountEmail) ||
    (serviceId !== null && codeForced === serviceId);
  const payNow =
    service && knownDue !== null && totals
      ? payNowLine(knownDue, totals.priceMinor, storefront.currency)
      : null;
  const businessDeposit = businessDepositFor(
    storefront,
    service,
    addOns.ids.length
  );
  const ruleMoney = depositRuleFields(businessDeposit, knownDue);
  const tokenMissing = Boolean(turnstileSiteKey) && !token;
  const emailCode = useEmailCode({
    addOnIds: addOns.ids,
    actions,
    email,
    onFormError: setFormError,
    // Turnstile tokens are single-use: solve again before the booking call.
    onTokenSpent: () => setResetKey((n) => n + 1),
    serviceId,
    startsAt,
    token,
    tokenMissing,
  });
  const { isVerified, stepOpen } = emailCode;

  const changeEmail = () => {
    emailCode.closeStep();
    document.getElementById(FIELD_IDS.email)?.focus();
  };

  const onBookingFailed = (outcome: Failure) => {
    setFormError(outcome.message);
    if (outcome.code === "email_unverified") {
      // The proof was used, expired or never accepted: ask for a new code.
      emailCode.dropProof();
      setCodeForced(serviceId);
    }
    if (outcome.code === "add_ons_unavailable") {
      addOns.gone(outcome.message);
      setStartsAt(null);
    }
    if (outcome.code === "slot_taken") {
      setStartsAt(null);
      setReloadKey((n) => n + 1);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || emailCode.busy) {
      return;
    }
    // Enter on a radio or checkbox in step 1 or 2 submits the form: on a phone
    // that means "next step", never a validation of fields that are not shown.
    if (steps.enhanced && step !== 3 && onPhone()) {
      if (step === 1 && service) {
        steps.goTo(2);
      } else if (step === 2 && startsAt) {
        steps.goTo(3);
      }
      return;
    }
    if (timesBusy && startsAt) {
      setFormError(TIMES_UPDATING);
      return;
    }
    if (stepOpen) {
      await emailCode.verify();
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
    // A problem in a part that is not on screen: take the person to it.
    if (steps.enhanced && onPhone()) {
      if (found.service) {
        steps.goTo(1);
      } else if (found.time) {
        steps.goTo(2);
      }
    }
    const gate = submitGate({
      found,
      serviceId,
      startsAt,
      needsCode,
      isVerified,
      tokenMissing,
    });
    if (gate.kind !== "send") {
      if (gate.kind === "code") {
        await emailCode.start();
      } else if (gate.kind === "token") {
        setFormError(TOKEN_LOADING_MESSAGE);
      }
      return;
    }
    const chosenId = gate.serviceId;
    const chosenStart = gate.startsAt;
    const print = fingerprint({
      serviceId: chosenId,
      startsAt: chosenStart,
      name,
      email,
      phone,
      notes,
      marketing,
      addOnIds: addOns.ids,
    });
    attempt.current = attemptFor(attempt.current, print);
    setSubmitting(true);
    track?.("booking_submitted", { service_id: chosenId });
    try {
      const outcome = await actions.submitBooking(
        requestInput(
          {
            idempotencyKey: attempt.current.key,
            serviceId: chosenId,
            startsAt: chosenStart,
            name,
            email,
            phone,
            notes,
            marketingConsent: marketing,
            ...(addOns.ids.length > 0 ? { addOnIds: addOns.ids } : {}),
            website,
            turnstileToken: token ?? "",
          },
          emailCode.proof
        )
      );
      if (outcome.ok) {
        attempt.current = null;
        track?.("booking_confirmed", { service_id: chosenId });
        steps.finish();
        setBooked(outcome.data);
        return;
      }
      onBookingFailed(outcome);
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
    return (
      <BookingDone
        accountInvite={accountInvite}
        booked={booked}
        currency={storefront.currency}
        ManageLink={ManageLink}
        managePath={managePath}
        studioName={studioName}
      />
    );
  }

  const chosen = {
    currency: storefront.currency,
    dueMinor: knownDue,
    durationMin: service?.duration_min,
    priceMinor: totals?.priceMinor,
    serviceName: service?.name,
    startsAt,
    timeZone: storefront.timezone,
  };
  const summary = chosenSummary(chosen);
  const trail = chosenTrail(chosen);

  return (
    <>
      {signedIn && <SignedInLine signedIn={signedIn} />}
      <form
        aria-label="Book an appointment"
        className="book-form"
        data-direction={steps.direction}
        data-steps={steps.enhanced ? "on" : undefined}
        noValidate
        onSubmit={submit}
      >
        {steps.enhanced && (
          <StepHeader
            headingRef={steps.headingRef}
            onBack={steps.goBack}
            step={step}
          />
        )}
        {showSummary && (
          <ErrorSummary
            contact={storefront.contact}
            errorList={errorList}
            errors={errors}
            formError={formError}
            summaryRef={summaryRef}
          />
        )}

        <StepPane active={step === 1} step={1}>
          <ServicesStep
            addOnsChosen={addOns.ids.length > 0}
            bookAgain={bookAgain}
            errors={errors}
            onPick={pickService}
            selectedId={serviceId}
            storefront={storefront}
          />

          {service && addOns.offered.length > 0 ? (
            <AddOnStep
              chosen={addOns.ids}
              currency={storefront.currency}
              offered={addOns.offered}
              onToggle={(id) => {
                setTimesBusy(true);
                addOns.choose(id);
              }}
              service={service}
            />
          ) : null}
        </StepPane>

        <StepPane active={step === 2} step={2}>
          {steps.enhanced && (
            <ChosenTrail
              editLabel="service"
              onEdit={() => steps.editTo(1)}
              text={trail}
            />
          )}
          <TimeStep
            actions={actions}
            addOnIds={addOns.ids}
            currentKey={() => keyRef.current}
            errors={errors}
            initialDay={day}
            onAddOnsGone={(message) => {
              addOns.gone(message);
              setStartsAt(null);
            }}
            onBusyChange={setTimesBusy}
            onChange={pickStart}
            onDayChange={(next) => {
              setDay(next);
              setTimeGone(false);
            }}
            onQuote={setQuote}
            onUnavailable={() => {
              addOns.timeNoLongerFits();
              setTimeGone(true);
            }}
            reloadKey={reloadKey + addOns.reloads}
            service={service}
            startsAt={startsAt}
            storefront={storefront}
            timeNote={addOns.note ?? (timeGone ? TIME_GONE_MESSAGE : null)}
          />
        </StepPane>

        <StepPane active={step === 3} step={3}>
          {steps.enhanced && step === 3 && (
            <ChosenTrail
              editLabel="time"
              onEdit={() => steps.editTo(2)}
              text={trail}
            />
          )}
          <fieldset className="step">
            <legend>3. Your details</legend>
            <TextField
              autoComplete="name"
              error={errors.name}
              id={FIELD_IDS.name}
              label="Name"
              maxLength={120}
              name="name"
              onChange={editName}
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
              onChange={editEmail}
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
              onChange={editPhone}
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
              onChange={editNotes}
              value={notes}
            />
            <label className="check">
              <input
                checked={marketing}
                name="marketing"
                onChange={(e) => {
                  setMarketing(e.target.checked);
                  keepDetails({ marketing: e.target.checked });
                }}
                type="checkbox"
              />
              <span>
                Send me news and offers from {studioName}. (Optional. We will
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
          </fieldset>
        </StepPane>

        {/* Outside the panes on purpose: Cloudflare cannot be trusted to solve
            in a `display: none` box, so on phone steps 1 and 2 it is kept in
            layout but invisible (see `.book-turnstile` in the host CSS). */}
        {turnstileSiteKey ? (
          <div
            className="book-turnstile"
            data-hidden={steps.enhanced && step !== 3}
          >
            <Turnstile
              onToken={setToken}
              resetKey={resetKey}
              siteKey={turnstileSiteKey}
            />
          </div>
        ) : null}

        <StepPane active={step === 3} step={3}>
          {stepOpen && (
            <CodePanel
              busy={emailCode.busy}
              code={emailCode.code}
              cooldown={emailCode.cooldown}
              email={email}
              error={emailCode.error}
              notice={emailCode.notice}
              onChangeEmail={changeEmail}
              onCode={emailCode.setCode}
              onResend={emailCode.resend}
              resendBlocked={codeResendBlocked(
                emailCode.cooldown,
                emailCode.busy,
                tokenMissing
              )}
            />
          )}
          {isVerified && needsCode && (
            <VerifiedNotice proof={emailCode.proof} />
          )}

          <ServiceNotes
            businessDeposit={businessDeposit}
            noPayment={knownDue === 0}
            payNow={payNow}
            service={service}
            storefront={storefront}
          />
          <BookingRules
            lateFee={storefront.late_fee}
            policy={storefront.booking_policy}
            rules={{
              businessDepositMinor: ruleMoney.businessDepositMinor,
              businessName: storefront.display_name,
              currency: storefront.currency,
              cutoffHours: storefront.cancel_cutoff_hours,
              amountLoading: service !== null && knownDue === null && timesBusy,
              depositOnTotal:
                service !== null &&
                knownDue === null &&
                !timesBusy &&
                !businessDeposit,
              dueMinor: ruleMoney.dueMinor,
              nonRefundable: storefront.deposit_non_refundable,
              ownDepositMinor: service?.deposit_minor,
              priceMinor: totals?.priceMinor,
            }}
          />
          {!stepOpen && (
            <button
              aria-disabled={
                submitting ||
                emailCode.busy !== null ||
                (timesBusy && !!startsAt)
              }
              className="btn btn-solid"
              disabled={
                submitting ||
                emailCode.busy !== null ||
                (timesBusy && !!startsAt)
              }
              type="submit"
            >
              {buttonLabel(
                submitting,
                emailCode.busy,
                needsCode && !isVerified
              )}
            </button>
          )}
        </StepPane>

        {steps.enhanced && step !== 3 && (
          <StepBar
            canContinue={step === 1 ? service !== null : startsAt !== null}
            onContinue={() => steps.goTo(step === 1 ? 2 : 3)}
            step={step}
            summary={summary}
          />
        )}
      </form>
    </>
  );
}

/**
 * The booking flow. If the API says the business is paused (409
 * BUSINESS_PAUSED) from any step, the form is replaced by a calm notice with the
 * business's contact links.
 */
export function BookingFlow(props: BookingFlowProps) {
  const { actions: hostActions, storefront } = props;
  const [paused, setPaused] = useState(false);
  const actions = useMemo(
    () => watchPaused(hostActions, () => setPaused(true)),
    [hostActions]
  );
  if (paused) {
    return (
      <PausedNotice
        businessName={storefront.display_name}
        contact={storefront.contact}
        Heading="h3"
        swapped
      />
    );
  }
  return <BookingFlowBody {...props} actions={actions} />;
}
