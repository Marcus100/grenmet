import type {
  CapLifecycleState,
  PublicPublishedProduct,
} from "@barrelsgd/api-client";
import type { Metadata } from "next";
import Link from "next/link";
import { DeskRefused, DeskUnavailable } from "@/components/desk/desk-panels";
import { RaiseToWarningForm } from "@/components/desk/raise-to-warning-form";
import {
  getEscalation,
  listPublishedProducts,
  suggestIbf,
} from "@/lib/desk/api";
import {
  type MatrixSuggestion,
  matrixInputs,
  raisableLabel,
  raisableProducts,
  validityWords,
} from "@/lib/desk/escalations";
import { requireDeskGate } from "@/lib/desk/gate";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = { title: "GMS alerts" };
export const dynamic = "force-dynamic";

type RowStatus =
  | { kind: "ready"; suggestion: MatrixSuggestion }
  | { alertId: string; kind: "raised"; state: CapLifecycleState }
  | { kind: "unknown" };

const STATE_WORDS: Partial<Record<CapLifecycleState, string>> = {
  APPROVED: "approved, not yet published",
  DRAFT: "a draft that is not submitted yet",
  PUBLISHED: "in force",
  SUBMITTED: "waiting for approval",
};

/**
 * What the impact matrix says for this alert. It is advice: the colour is still
 * the forecaster's choice, and FastAPI asks for a reason if it differs.
 */
async function suggestionFor(
  accessToken: string,
  product: PublicPublishedProduct
): Promise<MatrixSuggestion> {
  const inputs = matrixInputs(product.values);
  if (!inputs) return { kind: "none" };
  try {
    const advice = await suggestIbf(accessToken, {
      impact: inputs.impact,
      kind: product.kind,
      likelihood: inputs.likelihood,
    });
    return { colour: advice.colour, kind: "suggested" };
  } catch (error) {
    reportError(error, "cap-desk-escalations");
    return { kind: "unknown" };
  }
}

/** Never throws: a failed check becomes the "could not check" state for that alert. */
async function statusFor(
  accessToken: string,
  product: PublicPublishedProduct
): Promise<RowStatus> {
  let lookup: Awaited<ReturnType<typeof getEscalation>>;
  try {
    lookup = await getEscalation(accessToken, product.id);
  } catch (error) {
    reportError(error, "cap-desk-escalations");
    return { kind: "unknown" };
  }
  if (lookup.alert_id && lookup.lifecycle_state) {
    return {
      alertId: lookup.alert_id,
      kind: "raised",
      state: lookup.lifecycle_state,
    };
  }
  return {
    kind: "ready",
    suggestion: await suggestionFor(accessToken, product),
  };
}

function AlertCard({
  product,
  status,
}: {
  product: PublicPublishedProduct;
  status: RowStatus;
}) {
  const label = raisableLabel(product.kind);
  const headingId = `gms-alert-${product.id}`;
  return (
    <article
      aria-labelledby={headingId}
      className="space-y-3 rounded-lg border p-4"
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold" id={headingId}>
          {label}
        </h2>
        <span className="text-caption text-muted-foreground">
          GMS alert, revision {product.revision}
        </span>
      </header>
      <p className="text-body-sm">{validityWords(product.values)}</p>
      {status.kind === "ready" ? (
        <RaiseToWarningForm
          label={label}
          productId={product.id}
          revision={product.revision}
          suggestion={status.suggestion}
        />
      ) : null}
      {status.kind === "raised" ? (
        <p className="text-body-sm" role="status">
          A warning was already raised from this alert, and it is{" "}
          {STATE_WORDS[status.state] ?? status.state.toLowerCase()}.{" "}
          <Link
            className="text-info inline-flex min-h-11 items-center font-medium underline"
            href={`/desk/alerts/${status.alertId}`}
          >
            Open the warning
          </Link>
        </p>
      ) : null}
      {status.kind === "unknown" ? (
        <p className="text-destructive text-body-sm font-medium" role="alert">
          Could not check whether a warning was already raised from this alert.
          It is not raised here until the check works. Reload the page.
        </p>
      ) : null}
    </article>
  );
}

/** Current GMS hazard alerts, each with a Raise to warning action or its state. */
export default async function GmsAlertsPage() {
  const gate = await requireDeskGate("/desk/escalations");
  if (gate.status === "refused") return <DeskRefused email={gate.email} />;
  if (!gate.permissions.create) {
    return <DeskRefused email={gate.email} />;
  }
  let products: PublicPublishedProduct[];
  try {
    products = raisableProducts(
      (await listPublishedProducts(gate.accessToken)).products
    );
  } catch (error) {
    reportError(error, "cap-desk-escalations");
    return <DeskUnavailable what="The GMS alert list" />;
  }
  const rows = await Promise.all(
    products.map(async (product) => ({
      product,
      status: await statusFor(gate.accessToken, product),
    }))
  );
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">GMS alerts</h1>
        <p className="text-muted-foreground text-body-sm">
          A GMS alert is green. Raise it to a warning to create a CAP draft in
          the colour you choose, linked to the alert. Nothing is submitted,
          approved, published or sent: the draft goes through the same steps as
          any other warning.
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="text-body-sm" role="status">
          No GMS alerts are in force, so there is nothing to raise to a warning.
        </p>
      ) : (
        <ul className="space-y-4">
          {rows.map(({ product, status }) => (
            <li key={product.id}>
              <AlertCard product={product} status={status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
