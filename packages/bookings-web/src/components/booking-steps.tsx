"use client";

import type { ReactNode, RefObject } from "react";
import { formatDateTime, formatMoney } from "../lib/booking-format";
import { type BookingStep, STEP_COUNT, STEP_NAMES } from "./use-booking-steps";

const STEPS: readonly BookingStep[] = [1, 2, 3];

/** The step title read out and shown: "Step 2 of 3: Time". */
export function stepTitle(step: BookingStep): string {
  return `Step ${step} of ${STEP_COUNT}: ${STEP_NAMES[step]}`;
}

/**
 * One step's part of the form. Without the phone layout (laptops, and any page
 * whose JavaScript has not loaded) it is `display: contents`, so the form
 * lays out exactly as it always did; on phones the host CSS hides the panes
 * that are not the current step with `display: none`.
 */
export function StepPane({
  active,
  children,
  step,
}: {
  active: boolean;
  children: ReactNode;
  step: BookingStep;
}) {
  return (
    <div className="book-pane" data-active={active} data-pane={step}>
      {children}
    </div>
  );
}

/** Back button, step heading, progress dots and a polite announcement (phones only). */
export function StepHeader({
  headingRef,
  onBack,
  step,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  step: BookingStep;
}) {
  return (
    <div className="book-progress book-phone-only">
      {step > 1 && (
        <button className="btn book-back" onClick={onBack} type="button">
          Back
        </button>
      )}
      <h2 className="book-step-title" ref={headingRef} tabIndex={-1}>
        {stepTitle(step)}
      </h2>
      <ol aria-label="Progress" className="book-dots">
        {STEPS.map((n) => (
          <li
            aria-current={n === step ? "step" : undefined}
            className="book-dot"
            data-done={n < step}
            key={n}
          >
            <span className="book-sr-only">{STEP_NAMES[n]}</span>
          </li>
        ))}
      </ol>
      <p aria-live="polite" className="book-sr-only" role="status">
        {stepTitle(step)}
      </p>
    </div>
  );
}

interface RecapInput {
  currency: string;
  dueMinor: number | null;
  priceMinor: number | undefined;
  serviceName: string | undefined;
  startsAt: string | null;
  timeZone: string;
}

/** One line of what is chosen so far, from the figures the form already has. */
export function recapLine(input: RecapInput): string {
  if (!input.serviceName) {
    return "No service chosen yet";
  }
  const parts = [input.serviceName];
  if (input.startsAt) {
    parts.push(formatDateTime(input.startsAt, input.timeZone));
  }
  if (input.priceMinor !== undefined) {
    parts.push(formatMoney(input.priceMinor, input.currency));
  }
  if (input.dueMinor !== null && input.dueMinor > 0) {
    parts.push(`${formatMoney(input.dueMinor, input.currency)} due now`);
  }
  return parts.join(" · ");
}

/** Why Continue cannot be used yet. */
function hintFor(step: BookingStep): string {
  return step === 1
    ? "Choose a service to continue."
    : "Choose a day and time to continue.";
}

/**
 * The bar at the foot of a phone on steps 1 and 2: what is chosen so far and
 * Continue. Step 3 has none: the form's own Book button is the only one.
 */
export function StepBar({
  canContinue,
  onContinue,
  recap,
  step,
}: {
  canContinue: boolean;
  onContinue: () => void;
  recap: string;
  step: BookingStep;
}) {
  return (
    <div className="book-bar book-phone-only">
      <p className="book-recap book-recap-bar">{recap}</p>
      {!canContinue && (
        <p className="book-hint muted" id="book-continue-hint">
          {hintFor(step)}
        </p>
      )}
      <button
        aria-describedby={canContinue ? undefined : "book-continue-hint"}
        aria-disabled={!canContinue}
        className="btn btn-solid book-continue"
        onClick={() => {
          if (canContinue) {
            onContinue();
          }
        }}
        type="button"
      >
        Continue
      </button>
    </div>
  );
}
