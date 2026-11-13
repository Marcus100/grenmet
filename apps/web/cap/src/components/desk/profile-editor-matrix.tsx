"use client";

import type { CapProfileMatrix, GmsColour } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { useGmsCatalogue } from "@/components/desk/gms-catalogue";
import { COLOUR_SURFACE, colourLabel } from "@/lib/desk/cap/cap-levels";
import {
  matrixProblems,
  PROFILE_COLOUR_MEANING,
  PROFILE_COLOURS,
  PROFILE_IMPACTS,
  PROFILE_LIKELIHOODS,
  wmoStarterMatrix,
} from "@/lib/desk/profile-matrix";

/**
 * Edits the four by four grid that turns a likelihood and an impact into a
 * warning colour for one hazard. Shown to people with hazard library access;
 * the editor itself is only offered to them.
 */
export function ProfileMatrixEditor({
  matrix,
  onChange,
}: {
  matrix: CapProfileMatrix | null | undefined;
  onChange: (next: CapProfileMatrix | null) => void;
}) {
  const catalogue = useGmsCatalogue();
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
      <h2 className="text-lg font-semibold">
        Impact matrix (likelihood by impact)
      </h2>
      <p className="text-muted-foreground text-body-sm">
        The colour a forecaster is shown for each likelihood and impact. Without
        a grid of its own, this hazard uses the standard World Meteorological
        Organization grid. A colour must never get milder as likelihood or
        impact rises.
      </p>
      {matrix ? (
        <>
          <div className="overflow-x-auto">
            <table className="text-body-sm w-full border-collapse">
              <caption className="sr-only">
                Warning colour for each likelihood and impact
              </caption>
              <thead>
                <tr>
                  <th className="border p-2 text-left" scope="col">
                    Likelihood \ Impact
                  </th>
                  {PROFILE_IMPACTS.map((impact) => (
                    <th
                      className="border p-2 text-left"
                      key={impact}
                      scope="col"
                    >
                      {impact}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PROFILE_LIKELIHOODS.map((likelihood, row) => (
                  <tr key={likelihood}>
                    <th
                      className="border p-2 text-left font-medium"
                      scope="row"
                    >
                      {likelihood}
                    </th>
                    {PROFILE_IMPACTS.map((impact, column) => {
                      const colour = matrix.cells[row]?.[column] ?? "green";
                      return (
                        <td className="border p-1" key={impact}>
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
                            {PROFILE_COLOURS.map((option) => (
                              <option key={option} value={option}>
                                {colourLabel(catalogue, option)}
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
          <dl className="text-body-sm grid gap-1 sm:grid-cols-2">
            {PROFILE_COLOURS.map((colour) => (
              <div className="flex gap-2" key={colour}>
                <dt className="font-medium">
                  {colourLabel(catalogue, colour)}
                </dt>
                <dd className="text-muted-foreground">
                  {PROFILE_COLOUR_MEANING[colour]}
                </dd>
              </div>
            ))}
          </dl>
          {problems.length ? (
            <ul
              className="text-destructive text-body-sm list-inside list-disc"
              role="alert"
            >
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          <Button
            onClick={() => onChange(null)}
            type="button"
            variant="outline"
          >
            Use the standard grid instead
          </Button>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-body-sm">
            This hazard uses the standard grid. Start a grid of its own from the
            standard values to change individual cells.
          </p>
          <Button
            onClick={() => onChange(wmoStarterMatrix())}
            type="button"
            variant="outline"
          >
            Start a grid from the standard values
          </Button>
        </div>
      )}
      {matrix ? (
        <p className="text-muted-foreground text-body-sm">
          Starter values are a draft. GMS must review them before this version
          is approved.
        </p>
      ) : null}
    </section>
  );
}
