/**
 * Marks an imported alert that does not fully follow the CAP 1.2 standard. The
 * first schema error is the tooltip. Public feeds omit both fields, so only an
 * explicit `false` shows the flag.
 */
/** The staff-only fields. Public alerts do not carry them. */
export interface SchemaFlagFields {
  schema_conformant?: boolean;
  schema_error?: string | null;
}

export function SchemaFlag({ alert }: { alert: SchemaFlagFields }) {
  if (alert.schema_conformant !== false) {
    return null;
  }
  return (
    <span
      className="border-gm-risk-amber text-caption text-gm-text-primary leading-caption inline-flex items-center rounded-md border px-2 py-0.5 font-medium"
      title={alert.schema_error ?? undefined}
    >
      Does not fully follow the CAP standard
    </span>
  );
}
