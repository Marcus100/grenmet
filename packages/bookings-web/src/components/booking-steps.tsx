"use client";

import type { ReactNode, RefObject } from "react";
import {
  formatDateTime,
  formatDuration,
  formatMoney,
} from "../lib/booking-format";
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

export interface ChosenInput {
  currency: string;
  /** Money paid online when booking, when known. */
  dueMinor: number | null;
  durationMin: number | undefined;
  priceMinor: number | undefined;
  serviceName: string | undefined;
  startsAt: string | null;
  timeZone: string;
}

/** What is chosen so far, in two lines: the service name, then its length, price and due amount. */
export interface ChosenSummary {
  detail: string | null;
  title: string;
}

/** The bar's summary: name on one line, "45 min · EC$100" under it. */
export function chosenSummary(input: ChosenInput): ChosenSummary {
  if (!input.serviceName) {
    return { title: "No service chosen yet", detail: null };
  }
  const parts: string[] = [];
  if (input.durationMin !== undefined) {
    parts.push(formatDuration(input.durationMin));
  }
  if (input.priceMinor !== undefined) {
    parts.push(formatMoney(input.priceMinor, input.currency));
  }
  if (input.dueMinor !== null && input.dueMinor > 0) {
    parts.push(`${formatMoney(input.dueMinor, input.currency)} due now`);
  }
  return {
    title: input.serviceName,
    detail: parts.length > 0 ? parts.join(" · ") : null,
  };
}

/**
 * One line for steps 2 and 3: service · day and time. The day is named only
 * with a chosen time: the picker's own day can differ from one remembered in
 * the link (a past day, or one with no open times), and must not be claimed.
 */
export function chosenTrail(input: ChosenInput): string {
  const parts: string[] = [];
  if (input.serviceName) {
    parts.push(input.serviceName);
  }
  if (input.startsAt) {
    parts.push(formatDateTime(input.startsAt, input.timeZone));
  }
  return parts.join(" · ");
}

/**
 * What has been chosen so far, one line, with an Edit link back to the step
 * that holds the last choice on it. Phones only: laptops show every part.
 */
export function ChosenTrail({
  editLabel,
  onEdit,
  text,
}: {
  editLabel: string;
  onEdit: () => void;
  text: string;
}) {
  if (!text) {
    return null;
  }
  return (
    <div className="book-trail book-phone-only">
      <p className="book-recap-trail">{text}</p>
      <button
        aria-label={`Edit ${editLabel}`}
        className="btn book-edit"
        onClick={onEdit}
        type="button"
      >
        Edit
      </button>
    </div>
  );
}

/** Why Continue cannot be used yet. */
function hintFor(step: BookingStep): string {
  return step === 1
    ? "Choose a service to continue."
    : "Choose a day and time to continue.";
}

/**
 * The bar at the foot of a phone on steps 1 and 2: the chosen service (name,
 * then its length and price), the reason Continue is off when it is, and
 * Continue. Step 3 has none: the form's own Book button is the only one.
 */
export function StepBar({
  canContinue,
  onContinue,
  step,
  summary,
}: {
  canContinue: boolean;
  onContinue: () => void;
  step: BookingStep;
  summary: ChosenSummary;
}) {
  return (
    <div className="book-bar book-phone-only">
      <div className="book-bar-text">
        <p className="book-recap book-recap-title">{summary.title}</p>
        {summary.detail ? (
          <p className="book-recap-detail muted">{summary.detail}</p>
        ) : null}
        {canContinue ? null : (
          <p className="book-hint muted" id="book-continue-hint">
            {hintFor(step)}
          </p>
        )}
      </div>
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
