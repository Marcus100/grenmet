"use client";

import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { cn } from "@barrelsgd/ui/lib/utils";
import { CircleAlert, Mail, Save, Send, TriangleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";

interface Station {
  icao: string;
  name: string;
  number: string;
  observer: string;
  position: string;
}

interface ValidationIssue {
  field: string;
  message: string;
  severity?: "error" | "warning";
}
type Status = "idle" | "checking" | "valid" | "invalid" | "error";
type SaveStatus = "idle" | "saving" | "saved" | "error";

import {
  cellUpdates,
  cellValue,
  columnKeys,
  FIELD_LABELS,
  type FieldColumn,
  REGISTER_SECTIONS,
} from "./eregister-layout";
import { RegisterTable, SectionCard } from "./eregister-ui";

interface Props {
  issues: ValidationIssue[];
  metarPreview: string;
  observedAt: string;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onValidate: () => void;
  onValidationIssuesChange: (
    updater: (issues: ValidationIssue[]) => ValidationIssue[]
  ) => void;
  onValidationStateChange: (state: Status) => void;
  onValueChange: (key: string, value: string) => void;
  saveStatus: SaveStatus;
  station: Station;
  validationStatus: Status;
  values: Record<string, string>;
}

function describedBy(severity: "error" | "warning" | undefined) {
  if (severity === "error") return "eregister-errors";
  if (severity === "warning") return "eregister-warnings";
}

function issueSeverity(
  issues: ValidationIssue[],
  field: string
): "error" | "warning" | undefined {
  const matches = issues.filter((issue) => issue.field === field);
  if (matches.some((issue) => (issue.severity ?? "error") === "error")) {
    return "error";
  }
  return matches.length > 0 ? "warning" : undefined;
}

export function ERegisterWorkbook({
  station,
  values,
  observedAt,
  issues,
  validationStatus,
  saveStatus,
  metarPreview,
  onBack,
  onValueChange,
  onValidationIssuesChange,
  onValidationStateChange,
  onValidate,
  onSubmit,
}: Props) {
  const errors = issues.filter(
    (issue) => (issue.severity ?? "error") === "error"
  );
  const warnings = issues.filter((issue) => issue.severity === "warning");
  // The sign digit of a signed value ("0254" = sign 0, 280 tenths) is remembered
  // while the digits beside it are still being keyed.
  const [leads, setLeads] = useState<Record<string, string>>({});
  const renderTable = (section: (typeof REGISTER_SECTIONS)[number]) => (
    <RegisterTable
      key={section.title}
      leads={leads}
      renderValue={(column: FieldColumn, layer) => {
        const upper = layer === "upper" ? column.upper : undefined;
        const keys = upper ? [upper.key] : columnKeys(column);
        const severity = keys
          .map((k) => issueSeverity(issues, k))
          .reduce(
            (worst, next) =>
              worst === "error" || next === "error" ? "error" : (worst ?? next),
            undefined as "error" | "warning" | undefined
          );
        let maxLength: number | undefined;
        if (upper) maxLength = 4;
        else if (column.parts) maxLength = column.parts.length;
        else if (column.signed) {
          maxLength = column.signed.role === "sign" ? 2 : 3;
        }
        let width = "w-12";
        if (column.wide) width = "w-56 text-left";
        else if (!upper && column.signed?.role === "sign") width = "w-10";
        return (
          <Input
            aria-describedby={describedBy(severity)}
            aria-invalid={severity === "error" || undefined}
            aria-label={
              upper
                ? `${upper.label} (${upper.code})`
                : `${column.label} (${column.code})`
            }
            className={cn(
              "h-9 rounded-none border-0 border-transparent border-b-2 bg-muted/40 px-0.5 text-center font-mono text-body-sm shadow-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-inset",
              width,
              severity === "error" &&
                "border-destructive bg-destructive/10 text-destructive",
              severity === "warning" && "border-warning bg-warning-soft/30"
            )}
            maxLength={maxLength}
            onChange={(event) => {
              const text = event.target.value;
              if (upper) {
                onValueChange(upper.key, text);
              } else {
                const result = cellUpdates(column, text, values, leads);
                const { lead } = result;
                if (lead !== undefined) {
                  setLeads((current) => ({ ...current, [column.key]: lead }));
                }
                for (const [key, value] of result.updates) {
                  onValueChange(key, value);
                }
              }
              onValidationIssuesChange((current) =>
                current.filter((issue) => !keys.includes(issue.field))
              );
              onValidationStateChange("idle");
            }}
            placeholder={
              !upper && column.signed?.role === "sign"
                ? `${column.signed.prefix}0`
                : undefined
            }
            value={
              upper
                ? (values[upper.key] ?? "")
                : cellValue(column, values, leads)
            }
          />
        );
      }}
      section={section}
      values={values}
    />
  );
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">
            Weather Electronic Register
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => onBack()} size="lg" variant="outline">
            Observation archive
          </Button>
          <Button aria-current="page" size="lg">
            New observation
          </Button>
        </div>
      </div>

      <form className="flex flex-col gap-6" onSubmit={onSubmit}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-stretch gap-4">
            {REGISTER_SECTIONS.slice(0, 1).map(renderTable)}
            <SectionCard
              action={<Badge variant="light-info">Draft · QC required</Badge>}
              className="w-fit max-w-full"
              title="Observation"
            >
              <dl className="space-y-3 p-4 text-sm">
                <div>
                  <dt className="font-medium">{station.name}</dt>
                  <dd className="text-muted-foreground">
                    Station {station.number} ({station.icao}) ·{" "}
                    {station.position}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Observation hour</dt>
                  <dd className="font-medium tabular-nums">
                    {observedAt.replace("T", " ")} UTC
                  </dd>
                </div>
              </dl>
            </SectionCard>
          </div>
          {REGISTER_SECTIONS.slice(1).map(renderTable)}
        </div>
        {errors.length > 0 && (
          <div
            className="space-y-1 rounded-md border border-destructive/30 border-l-4 border-l-destructive bg-destructive/5 px-3 py-2 text-destructive text-xs"
            id="eregister-errors"
            role="alert"
          >
            <p className="flex items-center gap-1.5 font-semibold">
              <CircleAlert className="size-3.5" />
              Error · fix before saving
            </p>
            {errors.map((issue) => (
              <p key={`${issue.field}-${issue.message}`}>
                <strong>{FIELD_LABELS[issue.field] ?? issue.field}</strong>:{" "}
                {issue.message}
              </p>
            ))}
          </div>
        )}
        {warnings.length > 0 && (
          <div
            className="space-y-1 rounded-md border border-border border-l-4 border-l-warning bg-card px-3 py-2 text-foreground text-xs"
            id="eregister-warnings"
            role="status"
          >
            <p className="flex items-center gap-1.5 font-semibold">
              <TriangleAlert className="size-3.5 text-warning" />
              Note · does not block saving
            </p>
            {warnings.map((issue) => (
              <p key={`${issue.field}-${issue.message}`}>
                <strong>{FIELD_LABELS[issue.field] ?? issue.field}</strong>:{" "}
                {issue.message}
              </p>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            {validationStatus === "valid"
              ? "WMO checks passed for the current workbook."
              : "Validate to check the entries against the WMO code tables. Errors block saving; notes only advise."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={validationStatus === "checking"}
              onClick={onValidate}
              type="button"
              variant="outline"
            >
              {validationStatus === "checking"
                ? "Checking…"
                : "Validate observation"}
            </Button>
            <Button
              disabled
              title="Not connected yet"
              type="button"
              variant="ghost"
            >
              <Send />
              Send last obs
            </Button>
            <Button
              disabled
              title="Not connected yet"
              type="button"
              variant="ghost"
            >
              <Mail />
              Email observation
            </Button>
            <Button disabled={saveStatus === "saving"} type="submit">
              <Save />
              {saveStatus === "saving" ? "Saving…" : "Save draft"}
            </Button>
          </div>
        </div>
        {saveStatus === "saved" && (
          <p className="text-muted-foreground text-xs" role="status">
            Draft saved. QC approval is still required.
          </p>
        )}
        {saveStatus === "error" && (
          <p className="text-destructive text-xs" role="alert">
            Draft could not be saved. Check the API and try again.
          </p>
        )}
      </form>
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          action={<Badge variant="secondary">Preview</Badge>}
          title="SYNOP"
        >
          <div className="space-y-3 p-4">
            <p className="text-muted-foreground text-xs">
              WMO encoder will generate this after code-table and cross-field
              validation.
            </p>
            <code className="block rounded-lg bg-muted px-3 py-3 font-mono text-muted-foreground text-xs">
              Pending validation · {station.number} ·{" "}
              {observedAt.replace("T", " ")} UTC
            </code>
          </div>
        </SectionCard>
        <SectionCard
          action={<Badge variant="secondary">Preview</Badge>}
          title="METAR / SPECI"
        >
          <div className="space-y-3 p-4">
            <p className="text-muted-foreground text-xs">
              SPECI appears only when a configured special-report trigger
              applies.
            </p>
            <code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-muted px-3 py-3 font-mono text-xs">
              {metarPreview}
            </code>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
