"use client";
import type { CapProfileMatrix, GmsColour } from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { COLOUR_LABEL, COLOUR_SURFACE } from "@/lib/cap-levels";
import {
  IBF_COLOUR_MEANING,
  IBF_COLOURS,
  IBF_IMPACTS,
  IBF_LIKELIHOODS,
  matrixProblems,
  wmoStarterMatrix,
} from "@/lib/ibf-matrix";

/**
 * Edits the four by four grid that turns a likelihood and an impact into a
 * warning colour for one hazard. Only shown to people who hold the permission
 * to manage the hazard library (the page decides).
 */
export function ImpactMatrixEditor({
  matrix,
  onChange,
  isDraft = true,
}: {
  /** False for a saved approved version with no unsaved edits. */
  isDraft?: boolean;
  matrix: CapProfileMatrix | null | undefined;
  onChange: (next: CapProfileMatrix | null) => void;
}) {
  const problems = matrix ? matrixProblems(matrix.cells) : [];
  function setCell(row: number, column: number, colour: GmsColour) {
    if (!matrix) return;
    onChange({
      cells: matrix.cells.map((cells, r) =>
        r === row ? cells.map((c, i) => (i === column ? colour : c)) : cells
      ),
    });
  }
  return (
    <section
      aria-label="Impact matrix"
      className="space-y-4 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Impact matrix (likelihood by impact)</h2>
        {matrix && isDraft ? <Badge variant="outline">Draft</Badge> : null}
      </div>
      <p className="text-muted-foreground text-sm">
        The colour a forecaster is shown for each likelihood and impact. Without
        a grid of its own, this hazard uses the standard World Meteorological
        Organization grid. A colour must never get milder as likelihood or
        impact rises.
      </p>
      {matrix ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Warning colour for each likelihood and impact
              </caption>
              <thead>
                <tr>
                  <th className="p-2 text-left" scope="col">
                    Likelihood \ Impact
                  </th>
                  {IBF_IMPACTS.map((impact) => (
                    <th className="p-2 text-left" key={impact} scope="col">
                      {impact}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {IBF_LIKELIHOODS.map((likelihood, row) => (
                  <tr key={likelihood}>
                    <th className="p-2 text-left font-medium" scope="row">
                      {likelihood}
                    </th>
                    {IBF_IMPACTS.map((impact, column) => {
                      const colour = matrix.cells[row]?.[column] ?? "green";
                      return (
                        <td className="p-1" key={impact}>
                          <NativeSelect
                            aria-label={`${likelihood} likelihood, ${impact} impact`}
                            onChange={(event) =>
                              setCell(
                                row,
                                column,
                                event.target.value as GmsColour
                              )
                            }
                            style={COLOUR_SURFACE[colour]}
                            value={colour}
                          >
                            {IBF_COLOURS.map((option) => (
                              <option key={option} value={option}>
                                {COLOUR_LABEL[option]}
                              </option>
                            ))}
                          </NativeSelect>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="grid gap-1 text-sm sm:grid-cols-2">
            {IBF_COLOURS.map((colour) => (
              <div className="flex gap-2" key={colour}>
                <dt className="font-medium">{COLOUR_LABEL[colour]}</dt>
                <dd className="text-muted-foreground">
                  {IBF_COLOUR_MEANING[colour]}
                </dd>
              </div>
            ))}
          </dl>
          {problems.length ? (
            <ul
              className="list-inside list-disc text-destructive text-sm"
              role="alert"
            >
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          <Button onClick={() => onChange(null)} variant="outline">
            Use the standard grid instead
          </Button>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">
            This hazard uses the standard grid. Start a grid of its own from the
            standard values to change individual cells.
          </p>
          <Button
            onClick={() => onChange(wmoStarterMatrix())}
            variant="outline"
          >
            Start a grid from the standard values
          </Button>
        </div>
      )}
      {matrix && isDraft ? (
        <p className="text-muted-foreground text-sm">
          Starter values are a draft. GMS must review them before this version
          is approved.
        </p>
      ) : null}
    </section>
  );
}
