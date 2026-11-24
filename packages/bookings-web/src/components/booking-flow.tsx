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
  useRef,
  useState,
} from "react";
import { addOnTotals } from "../lib/add-ons";
import { type Failure, tellsToContact } from "../lib/booking-errors";
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
  timeZonePlace,
} from "../lib/booking-format";
import { dueAtBooking, payNowLine } from "../lib/booking-payment";
import { cancellationPolicyLine, holdEndsLine } from "../lib/booking-policy";
import type {
  Booked,
  BookingFlowActions,
  BookingInput,
} from "../lib/booking-types";
import { contactEnding } from "../lib/business-contact";
import { AddOnStep, BookedAddOns } from "./add-on-step";
import { BookingRules } from "./booking-policy-text";
import { ContactLinks } from "./business-contact";
import { PaymentStatus } from "./payment-status";
import { ServiceList } from "./service-list";
import { SlotPicker } from "./slot-picker";
import { Turnstile } from "./turnstile";
import { useAddOns } from "./use-add-ons";
import {
  CODE_LENGTH,
  TOKEN_LOADING_MESSAGE,
  useEmailCode,
} from "./use-email-code";

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
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusWhen(headingRef, true);
  return (
    <div className="book-done">
      <section aria-labelledby="book-done" className="notice notice-ok">
        <h2 id="book-done" ref={headingRef} tabIndex={-1}>
          Thank you, {booking.customer_name.split(" ")[0]}
        </h2>
        <p>{statusLine(booking.status)}</p>
        {booking.hold_ends_at ? (
          <p>{holdEndsLine(booking.hold_ends_at, booking.timezone)}</p>
        ) : null}
        <p>{cancellationPolicyLine(booking.cancel_cutoff_hours)}</p>
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
  bookAgain,
  errors,
  onPick,
  selectedId,
  storefront,
}: {
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
        bookAgainIds={bookAgain.map((choice) => choice.serviceId)}
        currency={storefront.currency}
        onPick={onPick}
        selectedId={selectedId}
        services={storefront.services}
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
  onAddOnsGone,
  onChange,
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
  onAddOnsGone: (message: string) => void;
  onChange: (value: string | null) => void;
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
          key={service.id}
          load={async (firstDay) => {
            const outcome =
              addOnIds.length > 0
                ? await actions.loadSlots(service.id, firstDay, addOnIds)
                : await actions.loadSlots(service.id, firstDay);
            if (!outcome.ok && outcome.code === "add_ons_unavailable") {
              onAddOnsGone(outcome.message);
            }
            return outcome;
          }}
          onChange={onChange}
          onUnavailable={onUnavailable}
          reloadKey={reloadKey}
          timeZone={storefront.timezone}
          value={startsAt}
        />
      ) : (
        <p className="muted">Choose a service to see open times.</p>
      )}
      {timeNote ? (
        <p className="notice" role="status">
          {timeNote}
        </p>
      ) : null}
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

/** What is paid online for the chosen service, and its description. */
function ServiceNotes({
  payNow,
  service,
}: {
  payNow: string | null;
  service: BookingPublicService | null;
}) {
  return (
    <>
      {service && payNow && (
        <p className="notice payment-notice" role="status">
          {payNow}
        </p>
      )}
      {service && dueAtBooking(service) === 0 && (
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

export function BookingFlow({
  accountInvite,
  actions,
  bookAgain = [],
  managePath,
  ManageLink = PlainLink,
  signedIn,
  studioName,
  storefront,
  track,
  turnstileSiteKey,
}: BookingFlowProps) {
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
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
  const [booked, setBooked] = useState<Booked | null>(null);
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
  const pickService = (id: string) => {
    track?.("service_selected", { service_id: id });
    setServiceId(id);
    setStartsAt(null);
    addOns.reset();
    reviseErrors({ serviceId: id, startsAt: null });
  };
  const pickStart = (value: string | null) => {
    if (value && serviceId) {
      track?.("slot_selected", { service_id: serviceId });
    }
    setStartsAt(value);
    if (value) {
      addOns.clearNote();
    }
    reviseErrors({ startsAt: value });
  };
  const editName = (value: string) => {
    setName(value);
    reviseErrors({ name: value });
  };
  const editEmail = (value: string) => {
    setEmail(value);
    reviseErrors({ email: value });
  };
  const editPhone = (value: string) => {
    setPhone(value);
    reviseErrors({ phone: value });
  };
  const editNotes = (value: string) => {
    setNotes(value);
    reviseErrors({ notes: value });
  };

  const service = storefront.services.find((s) => s.id === serviceId) ?? null;
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
  const needsCode =
    (dueAtBooking(service) > 0 && !ownAccountEmail) ||
    (serviceId !== null && codeForced === serviceId);
  const payNow = service
    ? payNowLine(
        dueAtBooking(service),
        service.price_minor,
        storefront.currency
      )
    : null;
  const tokenMissing = Boolean(turnstileSiteKey) && !token;
  const emailCode = useEmailCode({
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

  return (
    <>
      {signedIn && <SignedInLine signedIn={signedIn} />}
      <form
        aria-label="Book an appointment"
        className="book-form"
        noValidate
        onSubmit={submit}
      >
        {showSummary && (
          <ErrorSummary
            contact={storefront.contact}
            errorList={errorList}
            errors={errors}
            formError={formError}
            summaryRef={summaryRef}
          />
        )}

        <ServicesStep
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
            onToggle={addOns.choose}
            service={service}
          />
        ) : null}

        <TimeStep
          actions={actions}
          addOnIds={addOns.ids}
          errors={errors}
          onAddOnsGone={(message) => {
            addOns.gone(message);
            setStartsAt(null);
          }}
          onChange={pickStart}
          onUnavailable={addOns.timeNoLongerFits}
          reloadKey={reloadKey + addOns.reloads}
          service={service}
          startsAt={startsAt}
          storefront={storefront}
          timeNote={addOns.note}
        />

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
              onChange={(e) => setMarketing(e.target.checked)}
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

          <Turnstile
            onToken={setToken}
            resetKey={resetKey}
            siteKey={turnstileSiteKey}
          />
        </fieldset>

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
        {isVerified && needsCode && <VerifiedNotice proof={emailCode.proof} />}

        <ServiceNotes payNow={payNow} service={service} />
        <BookingRules
          policy={storefront.booking_policy}
          rules={{
            businessName: storefront.display_name,
            currency: storefront.currency,
            cutoffHours: storefront.cancel_cutoff_hours,
            dueMinor: service ? dueAtBooking(service) : undefined,
            nonRefundable: storefront.deposit_non_refundable,
            ownDepositMinor: service?.deposit_minor,
            priceMinor: totals?.priceMinor,
          }}
        />
        {!stepOpen && (
          <button
            aria-disabled={submitting || emailCode.busy !== null}
            className="btn btn-solid"
            disabled={submitting || emailCode.busy !== null}
            type="submit"
          >
            {buttonLabel(submitting, emailCode.busy, needsCode && !isVerified)}
          </button>
        )}
      </form>
    </>
  );
}
