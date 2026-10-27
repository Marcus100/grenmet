"use client";
import { capSuggestIbf, type IbfSuggestion } from "@barrelsgd/api-client";
import { useEffect, useState } from "react";
import { reportError } from "@/lib/report-error";

export const IBF_LIKELIHOOD_VALUES = ["Very low", "Low", "Medium", "High"];
export const IBF_IMPACT_VALUES = ["Minimal", "Minor", "Significant", "Severe"];

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
        IBF_LIKELIHOOD_VALUES.includes(likelihood) &&
        IBF_IMPACT_VALUES.includes(impact)
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
        reportError(error, "wxproducts");
        if (!cancelled) setState({ status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [kind, likelihood, impact]);
  return state;
}
