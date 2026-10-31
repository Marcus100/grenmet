"use client";

import type { SynopValidationIssue } from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { cn } from "@barrelsgd/ui/lib/utils";
import { CircleAlert, Mail, Save, Send, TriangleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";

const COPY_FEEDBACK_MS = 2000;

interface Station {
  icao: string;
  name: string;
  number: string;
  observer: string;
  position: string;
}

type ValidationIssue = SynopValidationIssue;
type Status = "idle" | "checking" | "valid" | "invalid" | "error";
type SaveStatus = "idle" | "saving" | "saved" | "error";

import { type StationSettings, withDerived } from "./eregister-derived";
import {
  cellUpdates,
  cellValue,
  columnKeys,
  FIELD_LABELS,
  type FieldColumn,
  REGISTER_SECTIONS,
} from "./eregister-layout";
import {
  describeSends,
  type SendController,
  type SendTarget,
} from "./eregister-send";
import {
  type SettingsSaveResult,
  StationSettingsCard,
} from "./eregister-station-settings";
import {
  PendingSettingsNote,
  RegisterTable,
  SectionCard,
  TimeMarks,
} from "./eregister-ui";

interface Props {
  expectedMetar?: string | null;
  issues: ValidationIssue[];
  metarPreview: string;
  observedAt: string;
  onBack: () => void;
  onSaveStationSettings?: (
    settings: StationSettings
  ) => Promise<SettingsSaveResult>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onValidate: () => void;
  onValidationIssuesChange: (
    updater: (issues: ValidationIssue[]) => ValidationIssue[]
  ) => void;
  onValidationStateChange: (state: Status) => void;
  onValueChange: (key: string, value: string) => void;
  saveStatus: SaveStatus;
  send: SendController;
  station: Station;
  stationSettings?: StationSettings | null;
  validationStatus: Status;
  values: Record<string, string>;
}

// Groups 3 and 4 follow from the barometer as read; while the observer has not
// keyed them the worked-out group shows greyed in the cell (keying overrides).
const RULE_FILLED = new Set(["station_pressure", "msl_pressure"]);

function placeholderFor(
  column: FieldColumn,
  isUpper: boolean,
  shown: Record<string, string>
): string | undefined {
  if (isUpper) return;
  if (column.signed?.role === "sign") {
    return `${column.signed.prefix}${column.signed.example ?? "0"}`;
  }
  if (RULE_FILLED.has(column.key)) return shown[column.key] || undefined;
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

const CONFIRM_TEXT: Record<SendTarget, string> = {
  email: "Email this observation to the configured distribution list?",
  wis2: "Queue this observation for WIS2 publication through wis2box?",
};

function SendStatus({ send }: { send: SendController }) {
  const summary = describeSends(send.history);
  let confirmLabel = send.repeat ? "Send again" : "Confirm";
  if (send.pending !== null) confirmLabel = "Sending…";
  return (
    <div className="flex flex-col gap-2 text-xs">
      {send.confirming && (
        <fieldset
          aria-label="Confirm send"
          className="flex flex-wrap items-center gap-3 rounded-md border border-border border-l-4 border-l-primary bg-card px-3 py-2"
        >
          <p>
            {send.repeat
              ? "This observation was already sent to this target. Send it again?"
              : CONFIRM_TEXT[send.confirming]}
          </p>
          <Button
            disabled={send.pending !== null}
            onClick={send.confirm}
            size="sm"
            type="button"
          >
            {confirmLabel}
          </Button>
          <Button
            disabled={send.pending !== null}
            onClick={send.cancel}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
        </fieldset>
      )}
      {send.error && (
        <p className="text-destructive" role="alert">
          {send.error}
        </p>
      )}
      {summary && (
        <p className="text-muted-foreground" role="status">
          {summary}
        </p>
      )}
    </div>
  );
}

export function ERegisterWorkbook({
  station,
  values,
  observedAt,
  issues,
  validationStatus,
  saveStatus,
  send,
  metarPreview,
  expectedMetar,
  onBack,
  onValueChange,
  onValidationIssuesChange,
  onValidationStateChange,
  onValidate,
  onSubmit,
  onSaveStationSettings,
  stationSettings = null,
}: Props) {
  const errors = issues.filter(
    (issue) => (issue.severity ?? "error") === "error"
  );
  const warnings = issues.filter((issue) => issue.severity === "warning");
  // The sign digit of a signed value ("0254" = sign 0, 280 tenths) is remembered
  // while the digits beside it are still being keyed.
  const [leads, setLeads] = useState<Record<string, string>>({});
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );
  // The grey cells show what the register calculates from the entries.
  const shown = withDerived(values, stationSettings);
  // Stable keys: the message plus how many identical messages come before it.
  const metarIssues = issues
    .filter((issue) => issue.field === "metar_text")
    .map((issue, position, all) => ({
      key: `${issue.message}-${all.slice(0, position).filter((earlier) => earlier.message === issue.message).length}`,
      message: issue.message,
    }));
  const copyLabel = { idle: "Copy", copied: "Copied", failed: "Copy failed" }[
    copyState
  ];
  const copyStatus = copyState === "idle" ? "" : copyLabel;
  async function copyMetar() {
    try {
      await navigator.clipboard.writeText(expectedMetar ?? metarPreview);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_MS);
  }
  const changed = (keys: readonly string[]) => {
    onValidationIssuesChange((current) =>
      current.filter((issue) => !keys.includes(issue.field))
    );
    onValidationStateChange("idle");
  };
  const renderTable = (section: (typeof REGISTER_SECTIONS)[number]) => (
    <RegisterTable
      context={{ station: stationSettings }}
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
        if (column.computed && layer === "lower") {
          // Calculated from other entries (visibility code, dew point, humidity).
          return (
            <Input
              aria-label={`${column.label} (${column.code}), calculated`}
              className={cn(
                "h-9 cursor-default rounded-none border-0 bg-muted px-0.5 text-center font-mono text-body-sm text-muted-foreground shadow-none",
                column.signed?.role === "sign" ? "w-10" : "w-12"
              )}
              readOnly
              tabIndex={-1}
              value={cellValue(column, shown, leads)}
            />
          );
        }
        let maxLength: number | undefined;
        if (upper) maxLength = upper.maxLength ?? 4;
        else if (column.parts) maxLength = column.parts.length;
        else if (column.signed) {
          maxLength = column.signed.role === "sign" ? 2 : 3;
        }
        let width = "w-12";
        if (column.wide) width = "w-56 text-left";
        else if (column.size === "md") width = "w-16";
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
            placeholder={placeholderFor(column, upper !== undefined, shown)}
            value={
              upper
                ? (values[upper.key] ?? "")
                : cellValue(column, values, leads)
            }
          />
        );
      }}
      section={section}
      values={shown}
    />
  );
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3">
        <PageHeader title="Weather Electronic Register" />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => onBack()} variant="outline">
            Observation archive
          </Button>
          <Button aria-current="page">New observation</Button>
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
          <div className="flex flex-wrap items-start gap-4">
            <TimeMarks
              renderInput={(key, label) => (
                <Input
                  aria-label={`Time mark: ${label}`}
                  className="h-9 w-28 text-center font-mono"
                  maxLength={16}
                  onChange={(event) => {
                    onValueChange(key, event.target.value);
                    changed([key]);
                  }}
                  value={values[key] ?? ""}
                />
              )}
              values={values}
            />
            {onSaveStationSettings ? (
              <StationSettingsCard
                key={JSON.stringify(stationSettings)}
                onSave={onSaveStationSettings}
                settings={stationSettings}
              />
            ) : (
              <PendingSettingsNote settings={stationSettings} />
            )}
          </div>
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
              disabled={send.pending !== null}
              onClick={() => send.request("wis2")}
              type="button"
              variant="ghost"
            >
              <Send />
              Send last obs
            </Button>
            <Button
              disabled={send.pending !== null}
              onClick={() => send.request("email")}
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
        <SendStatus send={send} />
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
          action={
            <Badge variant="secondary">
              {expectedMetar ? "Checked" : "Preview"}
            </Badge>
          }
          title="METAR / SPECI"
        >
          <div className="space-y-3 p-4">
            <p className="text-muted-foreground text-xs">
              Built from the observation (SPECI is a special report: the same
              elements are checked). Copy it, or type the report you send; each
              element that differs from the observation is flagged.
            </p>
            <code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-muted px-3 py-3 font-mono text-xs">
              {expectedMetar ?? metarPreview}
            </code>
            <div className="flex gap-2">
              <Input
                aria-label="METAR or SPECI as sent"
                className="font-mono text-xs"
                maxLength={400}
                onChange={(event) =>
                  onValueChange("metar_text", event.target.value)
                }
                placeholder="METAR TGPY 071200Z 07015KT 9999 FEW018 28/21 Q1016="
                value={values.metar_text ?? ""}
              />
              <Button onClick={copyMetar} type="button" variant="outline">
                {copyLabel}
              </Button>
              <span
                aria-live="polite"
                className="sr-only"
                data-testid="copy-status"
              >
                {copyStatus}
              </span>
            </div>
            {metarIssues.map(({ key, message }) => (
              <p
                className="text-amber-700 text-xs dark:text-amber-400"
                key={key}
              >
                {message}
              </p>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
