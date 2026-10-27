"use client";
import type {
  CapProfileColourResponse,
  CapProfileImpactLevel,
  CapProfileSubtype,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { COLOUR_LABEL } from "@/lib/cap-levels";
import {
  IBF_COLOUR_MEANING,
  starterColourResponses,
  starterImpactLevels,
} from "@/lib/ibf-matrix";
import { ProfileField } from "./profile-field";

/**
 * What each impact level looks like for one hazard subtype, and the response
 * for each warning colour. Shown only to people who may manage the library.
 */
export function SubtypeImpactEditor({
  subtype,
  onChange,
  isDraft = true,
}: {
  /** False for a saved approved version with no unsaved edits. */
  isDraft?: boolean;
  subtype: CapProfileSubtype;
  onChange: (next: CapProfileSubtype) => void;
}) {
  const levels = subtype.impact_levels ?? [];
  const responses = subtype.colour_responses ?? [];
  const started = levels.length > 0 || responses.length > 0;

  function setLevel(index: number, patch: Partial<CapProfileImpactLevel>) {
    onChange({
      ...subtype,
      impact_levels: levels.map((level, i) =>
        i === index ? { ...level, ...patch } : level
      ),
    });
  }
  function setResponse(
    index: number,
    patch: Partial<CapProfileColourResponse>
  ) {
    onChange({
      ...subtype,
      colour_responses: responses.map((r, i) =>
        i === index ? { ...r, ...patch } : r
      ),
    });
  }
  return (
    <section
      aria-label={`Impact levels and responses for ${subtype.name || "this subtype"}`}
      className="space-y-3 rounded-lg border border-dashed p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">Impact levels and responses by colour</h3>
        {started && isDraft ? <Badge variant="outline">Draft</Badge> : null}
      </div>
      <p className="text-muted-foreground text-sm">
        Set all four impact levels and all four colour responses, or none. A
        subtype with only some of them cannot be approved.
      </p>
      {started ? null : (
        <Button
          onClick={() =>
            onChange({
              ...subtype,
              impact_levels: starterImpactLevels(),
              colour_responses: starterColourResponses(),
            })
          }
          variant="outline"
        >
          Start impact levels and responses
        </Button>
      )}
      {levels.map((level, index) => (
        <ProfileField
          key={level.impact}
          label={`${level.impact} impact: what it looks like (one per line)`}
          multiline
          onChange={(value) =>
            setLevel(index, { impacts: value ? value.split("\n") : [] })
          }
          value={(level.impacts ?? []).join("\n")}
        />
      ))}
      {responses.map((response, index) => (
        <ProfileField
          key={response.colour}
          label={`${COLOUR_LABEL[response.colour]} response (${IBF_COLOUR_MEANING[response.colour]})`}
          multiline
          onChange={(value) => setResponse(index, { response: value })}
          value={response.response ?? ""}
        />
      ))}
      {started ? (
        <Button
          onClick={() =>
            onChange({
              ...subtype,
              impact_levels: [],
              colour_responses: [],
              cell_texts: [],
            })
          }
          variant="outline"
        >
          Clear impact levels and responses
        </Button>
      ) : null}
    </section>
  );
}
