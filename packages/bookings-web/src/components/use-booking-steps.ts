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
export function onPhone(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(PHONE_QUERY).matches
  );
}

/** The step an entry of this flow's own history stands for, if it is one. */
function stepOfEntry(state: unknown): BookingStep | null {
  if (
    typeof state !== "object" ||
    state === null ||
    !("bookingStep" in state)
  ) {
    return null;
  }
  const value = state.bookingStep;
  return value === 2 || value === 3 ? value : null;
}

/**
 * Which of the three steps is showing. The state works at any width; only the
 * host CSS applies it, and only below `md` (and only once `enhanced`, so a page
 * whose JavaScript has not loaded shows every section). Nothing chosen lives
 * here: the flow keeps every choice, so moving between steps loses nothing.
 *
 * On phones each move forward also pushes a history entry (same URL), so the
 * browser's or phone's Back goes to the previous step instead of leaving the
 * page and losing what was typed. From `md` up no entry is pushed.
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
  // Counts moves the person made; focus moves to the heading after each one,
  // but not after an automatic return to an earlier step (the error summary
  // owns focus then).
  const [focusTick, setFocusTick] = useState(0);
  const latest = useRef({ hasService, hasTime, step });
  latest.current = { hasService, hasTime, step };
  // The step the first entry of this flow's history stands for.
  const baseStep = useRef<BookingStep>(initialStep);
  const pushed = useRef(false);

  useEffect(() => {
    setEnhanced(true);
  }, []);

  // The time was cleared (taken, or add-ons removed): go back to pick another.
  useEffect(() => {
    if (step === 3 && !hasTime) {
      setDirection("back");
      setStep(2);
      if (onPhone() && stepOfEntry(window.history.state) === 3) {
        // Drop the entry for the step we just left; popstate lands on step 2.
        window.history.back();
      }
    } else if (step !== 1 && !hasService) {
      setDirection("back");
      setStep(1);
    }
  }, [hasService, hasTime, step]);

  useEffect(() => {
    if (focusTick === 0 || !onPhone()) {
      return;
    }
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView?.({ block: "start" });
  }, [focusTick]);

  const move = useCallback((next: BookingStep) => {
    const from = latest.current.step;
    if (next === from) {
      return;
    }
    setFocusTick((n) => n + 1);
    setDirection(next > from ? "forward" : "back");
    setStep(next);
  }, []);

  const goTo = useCallback(
    (next: BookingStep) => {
      const from = latest.current.step;
      if (next > from && onPhone()) {
        if (stepOfEntry(window.history.state) === null) {
          baseStep.current = from;
        }
        window.history.pushState({ bookingStep: next }, "");
        pushed.current = true;
      }
      move(next);
    },
    [move]
  );

  // The in-page Back: undo the entry this flow pushed, else just change step.
  const goBack = useCallback(() => {
    const from = latest.current.step;
    if (onPhone() && stepOfEntry(window.history.state) === from) {
      window.history.back();
      return;
    }
    move(from === 3 ? 2 : 1);
  }, [move]);

  // The browser's or phone's own Back and Forward.
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      if (!pushed.current) {
        return;
      }
      let target = stepOfEntry(event.state) ?? baseStep.current;
      const { hasService: gotService, hasTime: gotTime } = latest.current;
      if (target === 3 && !gotTime) {
        target = 2;
      }
      if (target !== 1 && !gotService) {
        target = 1;
      }
      move(target);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [move]);

  return { direction, enhanced, goBack, goTo, headingRef, step };
}
