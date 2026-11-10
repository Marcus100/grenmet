import { type PayPeriodStatus, payPeriodStatus } from "@barrelsgd/api-client";

/**
 * Periods whose lines are final: no more edits, and payslips are only offered
 * from here on. Mirrors LOCKED_STATUSES in apps/api/fastapi/src/hr/payroll/models.py;
 * period-status.parity.test.ts fails if either side changes alone.
 */
export const LOCKED_PERIOD_STATUSES: readonly PayPeriodStatus[] = [
  payPeriodStatus.APPROVED,
  payPeriodStatus.EXPORTED,
  payPeriodStatus.CLOSED,
];

export function isLockedPeriod(status: PayPeriodStatus): boolean {
  return LOCKED_PERIOD_STATUSES.includes(status);
}
