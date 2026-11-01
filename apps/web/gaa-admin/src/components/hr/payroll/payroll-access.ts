/**
 * Which payroll actions the signed-in person may see. Organisation-wide keys
 * come from `all_scope_permission_keys`; self-service uses any key held.
 * The API still enforces every check; this only decides what to show.
 */
export interface PayrollAccess {
  canApprove: boolean;
  canConfirmTables: boolean;
  canExport: boolean;
  canManageRates: boolean;
  canPrepare: boolean;
  canReadAmounts: boolean;
  canReadSelf: boolean;
}

export function payrollAccess(
  organisationWideKeys: readonly string[],
  heldKeys: readonly string[]
): PayrollAccess {
  const wide = new Set(organisationWideKeys);
  const held = new Set(heldKeys);
  return {
    canReadAmounts: wide.has("hr.payroll.read.amounts"),
    canManageRates: wide.has("hr.payroll.rates.manage"),
    canConfirmTables: wide.has("hr.payroll.tables.confirm"),
    canPrepare: wide.has("hr.payroll.prepare"),
    canApprove: wide.has("hr.payroll.approve"),
    canExport: wide.has("hr.payroll.export"),
    canReadSelf: held.has("hr.payroll.read.self"),
  };
}
