import type { PayrollExportSettingsPublic } from "@barrelsgd/api-client";
import type { PayrollLoad } from "../load-payroll";
import type { PayrollAccess } from "../payroll-access";
import { PayrollMfaRequired, PayrollNoAccess } from "../payroll-states";
import {
  BANK_COLUMN_LABEL,
  GL_ACCOUNT_LABEL,
  NOT_STORED_NOTE,
} from "./export-labels";
import { ExportSettingsForm } from "./export-settings-form";

const WHAT = "Bank and GL export settings";

/** Bank file columns and GL codes. Reading needs export; changing needs rates.manage. */
export function ExportSettingsView({
  access,
  organisationId,
  securityUrl,
  settings,
}: {
  access: PayrollAccess;
  organisationId: string;
  securityUrl: string;
  settings: PayrollLoad<PayrollExportSettingsPublic>;
}) {
  if (!(access.canExport || access.canManageRates)) {
    return <PayrollNoAccess what={WHAT} />;
  }
  if (settings.state === "mfa") {
    return <PayrollMfaRequired securityUrl={securityUrl} what={WHAT} />;
  }
  if (settings.state !== "ready") {
    return <PayrollNoAccess what={WHAT} />;
  }
  const current = settings.data;
  if (!access.canManageRates) {
    return (
      <section aria-label={WHAT} className="space-y-6 text-sm">
        <div className="space-y-2">
          <h2 className="font-semibold text-base">Bank file columns</h2>
          <ul className="list-inside list-decimal">
            {current.bank_columns.map((key) => (
              <li key={key}>{BANK_COLUMN_LABEL[key] ?? key}</li>
            ))}
          </ul>
          <p className="text-muted-foreground">{NOT_STORED_NOTE}</p>
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold text-base">GL account codes</h2>
          <dl className="grid gap-2 sm:grid-cols-2">
            {Object.keys(GL_ACCOUNT_LABEL).map((key) => (
              <div key={key}>
                <dt>{GL_ACCOUNT_LABEL[key]}</dt>
                <dd className="font-mono text-muted-foreground">
                  {current.gl_accounts[key] || "Not set"}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    );
  }
  return (
    <ExportSettingsForm
      securityUrl={securityUrl}
      settings={{
        available_bank_columns: current.available_bank_columns,
        bank_columns: current.bank_columns,
        gl_accounts: current.gl_accounts,
        organisation_id: organisationId,
      }}
    />
  );
}
