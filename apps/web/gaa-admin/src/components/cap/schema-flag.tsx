import type { CapAlertPublic } from "@barrelsgd/api-client";

/**
 * Marks an imported alert that does not fully follow the CAP 1.2 standard. The
 * first schema error is the tooltip. We never publish such an alert.
 */
export function SchemaFlag({
  alert,
}: {
  alert: Pick<CapAlertPublic, "schema_conformant" | "schema_error">;
}) {
  if (alert.schema_conformant) {
    return null;
  }
  return (
    <span
      className="inline-flex items-center rounded-md border border-gm-risk-amber px-2 py-0.5 font-medium text-caption text-gm-text-primary leading-caption"
      title={alert.schema_error ?? undefined}
    >
      Does not fully follow the CAP standard
    </span>
  );
}
