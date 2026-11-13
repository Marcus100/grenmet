"use client";

import { useEffect, useId, useRef } from "react";
import type { ProductProblem } from "./product-problems";

/**
 * GOV.UK-style error summary placed at the top of a product form. It lists the
 * blocking problems, each linked to its field, and takes focus whenever
 * `focusRequest` changes (every failed attempt). Warnings are listed in their
 * own group below and never block.
 */
export function ProductErrorSummary({
  problems,
  warnings = [],
  focusRequest,
  onFollow,
}: {
  problems: readonly ProductProblem[];
  warnings?: readonly string[];
  focusRequest: number;
  onFollow: (problem: ProductProblem) => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusRequest > 0) ref.current?.focus();
  }, [focusRequest]);
  if (!(problems.length || warnings.length)) return null;
  return (
    <div className="space-y-3" data-slot="product-messages">
      {problems.length ? (
        <div
          aria-labelledby={titleId}
          className="border-destructive space-y-2 rounded-lg border-2 p-4 focus-visible:outline-none"
          data-slot="product-error-summary"
          ref={ref}
          role="alert"
          tabIndex={-1}
        >
          <h2 className="text-sm leading-5 font-semibold" id={titleId}>
            There is a problem
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {problems.map((problem) => (
              <li key={`${problem.fieldId ?? "form"}:${problem.message}`}>
                {problem.fieldId ? (
                  <a
                    className="font-medium underline underline-offset-2"
                    href={`#${problem.fieldId}`}
                    onClick={(event) => {
                      event.preventDefault();
                      onFollow(problem);
                    }}
                  >
                    {problem.message}
                  </a>
                ) : (
                  problem.message
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {warnings.length ? (
        <div
          className="rounded-lg border p-4 text-sm"
          data-slot="product-warnings"
        >
          <p className="font-semibold">
            Warnings (these do not stop you saving or publishing)
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
