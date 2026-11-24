"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** The three phone steps: 1 service, 2 time, 3 details. */
export type BookingStep = 1 | 2 | 3;

export const STEP_COUNT = 3;

/** Which way the person just moved; the host CSS slides the new step in from that side. */
export type StepDirection = "forward" | "back";

export const STEP_NAMES: Record<BookingStep, string> = {
  1: "Service",
  2: "Time",
  3: "Details",
};

/** Below this width (Tailwind `md`) the steps apply; CSS uses the same 767px. */
const PHONE_QUERY = "(max-width: 767px)";

/** True on a phone-sized screen; false where matchMedia is missing (tests, old browsers). */
function onPhone(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(PHONE_QUERY).matches
  );
}

/**
 * Which of the three steps is showing. The state works at any width; only the
 * host CSS applies it, and only below `md` (and only once `enhanced`, so a page
 * whose JavaScript has not loaded shows every section). Nothing chosen lives
 * here: the flow keeps every choice, so moving between steps loses nothing.
 */
export function useBookingSteps({
  hasService,
  hasTime,
  initialStep,
}: {
  hasService: boolean;
  hasTime: boolean;
  initialStep: BookingStep;
}) {
  const [step, setStep] = useState<BookingStep>(initialStep);
  const [enhanced, setEnhanced] = useState(false);
  // Unset until the first change, so nothing animates on page load.
  const [direction, setDirection] = useState<StepDirection | undefined>();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Focus moves only after a step change the person made, not after an
  // automatic return to an earlier step (the error summary owns focus then).
  const moveFocus = useRef(false);

  useEffect(() => {
    setEnhanced(true);
  }, []);

  // The time was cleared (taken, or add-ons removed): go back to pick another.
  useEffect(() => {
    if (step === 3 && !hasTime) {
      setDirection("back");
      setStep(2);
    } else if (step !== 1 && !hasService) {
      setDirection("back");
      setStep(1);
    }
  }, [hasService, hasTime, step]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after each step change
  useEffect(() => {
    if (!moveFocus.current) {
      return;
    }
    moveFocus.current = false;
    if (!onPhone()) {
      return;
    }
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView?.({ block: "start" });
  }, [step]);

  const current = useRef(step);
  current.current = step;
  const goTo = useCallback((next: BookingStep) => {
    if (next === current.current) {
      return;
    }
    moveFocus.current = true;
    setDirection(next > current.current ? "forward" : "back");
    setStep(next);
  }, []);

  return { direction, enhanced, goTo, headingRef, step };
}
