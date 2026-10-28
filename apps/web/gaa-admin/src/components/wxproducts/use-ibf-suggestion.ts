"use client";
import { capSuggestIbf, type IbfSuggestion } from "@barrelsgd/api-client";
import { useEffect, useState } from "react";
import { IBF_IMPACTS, IBF_LIKELIHOODS } from "@/lib/ibf-matrix";
import { reportError } from "@/lib/report-error";

const LIKELIHOOD_VALUES: readonly string[] = IBF_LIKELIHOODS;
const IMPACT_VALUES: readonly string[] = IBF_IMPACTS;

/** Statuses the endpoint answers when there is simply nothing to suggest. */
const EXPECTED_STATUSES = new Set([403, 422]);

function isExpectedFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    EXPECTED_STATUSES.has(error.status)
  );
}

export type IbfSuggestionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; suggestion: IbfSuggestion };

/**
 * The colour the impact matrix suggests for one likelihood and impact of an
 * alert kind. Stays idle until both answers are valid, because FastAPI only
 * compares a raise with the matrix when it has both.
 */
export function useIbfSuggestion(
  kind: string,
  likelihood: string | undefined,
  impact: string | undefined
): IbfSuggestionState {
  const [state, setState] = useState<IbfSuggestionState>({ status: "idle" });
  useEffect(() => {
    if (
      !(
        likelihood &&
        impact &&
        LIKELIHOOD_VALUES.includes(likelihood) &&
        IMPACT_VALUES.includes(impact)
      )
    ) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    capSuggestIbf({
      query: {
        kind,
        likelihood: likelihood as IbfSuggestion["likelihood"],
        impact: impact as IbfSuggestion["impact"],
      },
    })
      .unwrap()
      .then((suggestion) => {
        if (!cancelled) setState({ status: "ready", suggestion });
      })
      .catch((error) => {
        // The matrix is guidance; the form still works without it.
        if (!isExpectedFailure(error)) reportError(error, "wxproducts");
        if (!cancelled) setState({ status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [kind, likelihood, impact]);
  return state;
}
