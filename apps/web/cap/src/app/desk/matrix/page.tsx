import { isAuthApiError } from "@barrelsgd/auth";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import type { Metadata } from "next";
import { DeskRefused, DeskUnavailable } from "@/components/desk/desk-panels";
import { MatrixAdvice } from "@/components/desk/matrix-advice";
import { getIbfMatrix, listHazardProfiles } from "@/lib/desk/api";
import { requireDeskGate } from "@/lib/desk/gate";
import { KIND_PATTERN, type MatrixView, matrixView } from "@/lib/desk/ibf";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = { title: "Impact matrix" };
export const dynamic = "force-dynamic";

function KindPicker({ keys, kind }: { keys: string[]; kind: string }) {
  return (
    <form
      action="/desk/matrix"
      className="flex flex-wrap items-end gap-3"
      method="get"
    >
      <label className="flex flex-col gap-1 text-body-sm" htmlFor="matrix-kind">
        Hazard
        <NativeSelect defaultValue={kind} id="matrix-kind" name="kind">
          <option value="">Choose a hazard</option>
          {keys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </NativeSelect>
      </label>
      <button
        className="rounded-md border px-3 py-2 text-body-sm"
        type="submit"
      >
        Show matrix
      </button>
    </form>
  );
}

function Grid({ view }: { view: MatrixView }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body-sm">
        <caption className="mb-2 text-left text-muted-foreground">
          Likelihood down the side, impact across the top. Each cell is the
          colour a forecaster is shown for that pair.
        </caption>
        <thead>
          <tr>
            <th className="border p-2 text-left" scope="col">
              Likelihood \ Impact
            </th>
            {view.columns.map((column) => (
              <th
                className="border p-2 text-left"
                key={column.label}
                scope="col"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.label}>
              <th className="border p-2 text-left" scope="row">
                {row.label}
              </th>
              {row.cells.map((cell, index) => (
                <td
                  className="border p-2"
                  key={view.columns[index]?.label ?? `${row.label}-cell`}
                >
                  {cell.word}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The impact-based matrix for one hazard, read only. The matrix is edited in
 * the hazard profile (GAA Admin for now); this desk shows it and offers advice.
 */
export default async function MatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string | string[] }>;
}) {
  const gate = await requireDeskGate("/desk/matrix");
  if (gate.status === "refused") return <DeskRefused email={gate.email} />;

  const { kind: rawKind } = await searchParams;
  const kind = typeof rawKind === "string" ? rawKind : "";

  let keys: string[];
  try {
    const profiles = await listHazardProfiles(gate.accessToken);
    keys = [...new Set(profiles.map((profile) => profile.key))].sort();
  } catch (error) {
    if (isAuthApiError(error) && error.status === 403) {
      return <DeskRefused email={gate.email} />;
    }
    reportError(error, "cap-desk-matrix");
    return <DeskUnavailable what="The hazard list" />;
  }

  const header = (
    <header className="space-y-1">
      <h1 className="font-semibold text-2xl">Impact matrix</h1>
      <p className="text-body-sm text-muted-foreground">
        Read only. The matrix sets the colour for each likelihood and impact.
        Advice below never changes a warning until you choose the colour.
      </p>
    </header>
  );

  if (!kind) {
    return (
      <section className="space-y-6">
        {header}
        <KindPicker keys={keys} kind="" />
        <p className="rounded-lg border p-6 text-muted-foreground">
          Choose a hazard to see its impact matrix.
        </p>
      </section>
    );
  }

  if (!(KIND_PATTERN.test(kind) && keys.includes(kind))) {
    return (
      <section className="space-y-6">
        {header}
        <KindPicker keys={keys} kind="" />
        <p
          className="rounded-lg border border-destructive p-4 text-destructive"
          role="alert"
        >
          There is no hazard profile called “{kind}”. Choose one from the list.
        </p>
      </section>
    );
  }

  let view: MatrixView;
  try {
    const matrix = await getIbfMatrix(gate.accessToken, kind);
    view = matrixView(matrix, kind);
  } catch (error) {
    if (isAuthApiError(error) && error.status === 403) {
      return <DeskRefused email={gate.email} />;
    }
    if (
      isAuthApiError(error) &&
      (error.status === 404 || error.status === 422)
    ) {
      return (
        <section className="space-y-6">
          {header}
          <KindPicker keys={keys} kind={kind} />
          <p className="rounded-lg border p-4" role="status">
            This hazard has no impact matrix yet.
          </p>
        </section>
      );
    }
    reportError(error, "cap-desk-matrix");
    return <DeskUnavailable what="The impact matrix" />;
  }

  return (
    <section className="space-y-6">
      {header}
      <KindPicker keys={keys} kind={kind} />
      <p className="text-body-sm">
        <strong>Source: </strong>
        {view.source}
      </p>
      <Grid view={view} />
      <MatrixAdvice kind={kind} />
    </section>
  );
}
