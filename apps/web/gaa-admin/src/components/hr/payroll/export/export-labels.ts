/**
 * Plain names for the keys the export settings API returns. The API sends the
 * keys only; an unknown key shows as itself, so a new key is never hidden.
 */
export const BANK_COLUMN_LABEL: Record<string, string> = {
  employee_number: "Employee number",
  payroll_reference: "Payroll reference",
  employee_name: "Employee name",
  bank_account: "Bank account",
  net_amount: "Net amount",
  net_minor: "Net amount in cents",
  currency: "Currency",
  reference: "Payment reference",
};

export const GL_ACCOUNT_LABEL: Record<string, string> = {
  GROSS_PAY_EXPENSE: "Gross pay expense",
  EMPLOYER_CONTRIBUTION_EXPENSE: "Employer contributions expense",
  NET_PAY_PAYABLE: "Net pay payable",
  INCOME_TAX_PAYABLE: "Income tax payable",
  SOCIAL_INSURANCE_PAYABLE: "Social insurance payable",
  OTHER_DEDUCTIONS_PAYABLE: "Other deductions payable",
};

export const NOT_STORED_NOTE =
  "Bank account numbers are not stored in this system, so that column reads NOT STORED.";
