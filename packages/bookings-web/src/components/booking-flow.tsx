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
import type { Failure } from "../lib/booking-errors";
import {
  type FieldErrors,
  type FieldKey,
  fingerprint,
  validateBooking,
} from "../lib/booking-form";
import {
  formatDateTime,
  formatDuration,
  formatHours,
  formatMoney,
  timeZonePlace,
} from "../lib/booking-format";
import type {
  Booked,
  BookingFlowActions,
  ContactChannel,
} from "../lib/booking-types";
import { SlotPicker } from "./slot-picker";
import { Turnstile } from "./turnstile";
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
  /** How people reach the studio by hand when no slot is open online. */
  contact: ContactChannel;
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
  storefront: BookingStorefront;
  /** The studio's name, used in the marketing opt-in wording. */
  studioName: string;
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

function byCategory(services: BookingPublicService[]) {
  const groups = new Map<string, BookingPublicService[]>();
  for (const service of services) {
    const key = service.category ?? "Services";
    groups.set(key, [...(groups.get(key) ?? []), service]);
  }
  return [...groups];
}

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
            <dd>{formatMoney(booking.price_minor, currency)}</dd>
          </div>
        </dl>
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

export function BookingFlow({
  accountInvite,
  actions,
  bookAgain = [],
  contact,
  managePath,
  ManageLink = PlainLink,
  signedIn,
  studioName,
  storefront,
  turnstileSiteKey,
}: BookingFlowProps) {
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
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

  const service = storefront.services.find((s) => s.id === serviceId) ?? null;
  const errorList = (Object.keys(errors) as FieldKey[]).filter(
    (key) => errors[key]
  );
  const showSummary = errorList.length > 0 || formError !== null;

  useFocusWhen(summaryRef, showSummary);

  const needsCode =
    (service?.deposit_minor ?? 0) > 0 ||
    (serviceId !== null && codeForced === serviceId);
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
    if (Object.keys(found).length > 0 || !serviceId || !startsAt) {
      return;
    }
    if (needsCode && !isVerified) {
      await emailCode.start();
      return;
    }
    if (tokenMissing) {
      setFormError(TOKEN_LOADING_MESSAGE);
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
      const outcome = await actions.submitBooking({
        idempotencyKey: attempt.current.key,
        serviceId,
        startsAt,
        name,
        email,
        ...(emailCode.proof ? { emailProof: emailCode.proof } : {}),
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

        <fieldset
          aria-describedby={groupErrorId("service", errors)}
          className="step"
          id={FIELD_IDS.service}
        >
          <legend>1. Choose a service</legend>
          <GroupError errors={errors} field="service" />
          <BookAgain
            choices={bookAgain}
            onChoose={(id) => {
              setServiceId(id);
              setStartsAt(null);
            }}
            selected={serviceId}
            storefront={storefront}
          />
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
                    {formatMoney(item.price_minor, storefront.currency)}
                  </span>
                </label>
              ))}
            </div>
          ))}
          {storefront.services.length === 0 && (
            <p className="muted">
              No services are open for online booking yet. Please message us on{" "}
              {contact.label}.
            </p>
          )}
        </fieldset>

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
              load={(firstDay) => actions.loadSlots(service.id, firstDay)}
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
            resendBlocked={
              emailCode.cooldown > 0 || emailCode.busy !== null || tokenMissing
            }
          />
        )}
        {isVerified && needsCode && (
          <p className="notice notice-ok" role="status">
            {emailCode.proof
              ? "Your email is verified."
              : "No email code is needed for this booking."}{" "}
            Press Request my booking to finish.
          </p>
        )}

        <p className="muted">
          By appointment only. You can change or cancel online until{" "}
          {formatHours(storefront.cancel_cutoff_hours)} before your visit.
        </p>
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
