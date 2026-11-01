"use client";
import type { ComponentProps } from "react";
import {
  GmsCatalogueBoundary,
  useGmsCatalogue,
} from "@/components/cap/gms-catalogue";
import { COLOUR_SURFACE, colourLabel } from "@/lib/cap-levels";
import { useIbfSuggestion } from "./use-ibf-suggestion";

/**
 * Shows the colour the impact matrix suggests for the likelihood and impact
 * chosen in the form. It only advises: the forecaster decides, and choosing a
 * different colour when raising a warning needs a reason.
 */
function ImpactMatrixPanelContent({
  kind,
  likelihood,
  impact,
}: {
  kind: string;
  likelihood?: string;
  impact?: string;
}) {
  const catalogue = useGmsCatalogue();
  const state = useIbfSuggestion(kind, likelihood, impact);
  return (
    <section
      aria-label="Impact matrix suggestion"
      className="space-y-2 rounded-lg border p-3 text-sm"
    >
      <h2 className="font-semibold">Suggested colour from the impact matrix</h2>
      {state.status === "ready" ? (
        <>
          <p className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-md px-2 py-1 font-semibold"
              data-testid="suggested-colour"
              style={COLOUR_SURFACE[state.suggestion.colour]}
            >
              {colourLabel(catalogue, state.suggestion.colour)}
            </span>
            <span>
              {state.suggestion.meaning}: {state.suggestion.likelihood}{" "}
              likelihood, {state.suggestion.impact} impact.
            </span>
          </p>
          <p className="text-muted-foreground">
            {state.suggestion.library_key
              ? `From hazard library entry ${state.suggestion.library_key}, version ${state.suggestion.library_version}.`
              : "No approved hazard library entry yet, so the standard World Meteorological Organization grid is used."}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground">
          {state.status === "loading" && "Reading the matrix…"}
          {state.status === "failed" &&
            "The matrix could not be read. You can still raise a warning."}
          {state.status === "idle" &&
            "Choose a likelihood and an impact level to see the suggested colour."}
        </p>
      )}
    </section>
  );
}

/** Shows a message in place of this panel when the GMS catalogue cannot load. */
export function ImpactMatrixPanel(
  props: ComponentProps<typeof ImpactMatrixPanelContent>
) {
  return (
    <GmsCatalogueBoundary>
      <ImpactMatrixPanelContent {...props} />
    </GmsCatalogueBoundary>
  );
}
