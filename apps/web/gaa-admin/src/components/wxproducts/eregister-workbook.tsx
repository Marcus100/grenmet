"use client";

import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@barrelsgd/ui/components/ui/card";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Save } from "lucide-react";
import type { FormEvent } from "react";

interface Station {
  icao: string;
  name: string;
  number: string;
  observer: string;
}

export interface RegisterGroup {
  fields: readonly (readonly [string, string, string])[];
  title: string;
}

interface ValidationIssue {
  field: string;
  message: string;
}
type Status = "idle" | "checking" | "valid" | "invalid" | "error";
type SaveStatus = "idle" | "saving" | "saved" | "error";

import { SectionCard } from "./eregister-ui";

interface Props {
  groups: readonly RegisterGroup[];
  issues: ValidationIssue[];
  metarPreview: string;
  observedAt: string;
  onBack: () => void;
  onObservedAtChange: (value: string) => void;
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

export function ERegisterWorkbook({
  station,
  groups,
  values,
  observedAt,
  issues,
  validationStatus,
  saveStatus,
  metarPreview,
  onBack,
  onObservedAtChange,
  onValueChange,
  onValidationIssuesChange,
  onValidationStateChange,
  onValidate,
  onSubmit,
}: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            Meteorological Observations Register
          </p>
          <h1 className="mt-1 font-semibold text-2xl tracking-tight">
            New observation
          </h1>
          <p className="text-muted-foreground text-sm">
            {station.name} · {station.icao} · structured WMO entry
          </p>
        </div>
        <Button onClick={() => onBack()} variant="outline">
          Observation archive
        </Button>
      </div>
      <SectionCard
        action={<Badge variant="light-info">Draft · QC required</Badge>}
        title="Hourly observation workbook"
      >
        <form className="space-y-5 p-4" onSubmit={onSubmit}>
          <div className="grid gap-4 border-b pb-5 md:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="new-observed-at">Observation time (UTC)</Label>
              <Input
                id="new-observed-at"
                onChange={(event) => onObservedAtChange(event.target.value)}
                type="datetime-local"
                value={observedAt}
              />
            </div>
            <div className="grid gap-2">
              <Label>Station</Label>
              <Input disabled value={`${station.icao} · ${station.number}`} />
            </div>
            <div className="grid gap-2">
              <Label>Observer</Label>
              <Input disabled value={station.observer} />
            </div>
          </div>
          <div className="grid gap-4">
            {groups.map((group) => (
              <Card className="gap-0 overflow-hidden py-0" key={group.title}>
                <CardHeader className="border-b bg-muted/30 px-3 py-2">
                  <CardTitle className="font-semibold text-xs uppercase tracking-wide">
                    {group.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <Table className="min-w-max border-collapse">
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        {group.fields.map(([label, key, code]) => (
                          <TableHead
                            className="h-28 min-w-10 border-border border-r p-0 align-bottom"
                            key={key}
                          >
                            <div className="flex h-28 flex-col items-center justify-end gap-1 pb-1">
                              <span className="block rotate-180 whitespace-nowrap text-[11px] [writing-mode:vertical-rl]">
                                {label}
                              </span>
                              <span className="block whitespace-nowrap font-mono font-normal text-[10px] text-muted-foreground">
                                {code}
                              </span>
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="align-top">
                        {group.fields.map(([label, key]) => (
                          <TableCell
                            className="border-border border-r p-0"
                            key={key}
                          >
                            <Input
                              aria-label={label}
                              className={cn(
                                "h-7 min-w-10 rounded-none border-0 bg-transparent px-0.5 font-mono text-[11px] shadow-none focus-visible:ring-1",
                                issues.some((issue) => issue.field === key) &&
                                  "bg-destructive/10 text-destructive"
                              )}
                              onChange={(event) => {
                                onValueChange(key, event.target.value);
                                onValidationIssuesChange((issues) =>
                                  issues.filter((issue) => issue.field !== key)
                                );
                                onValidationStateChange("idle");
                              }}
                              value={values[key] ?? ""}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
          {issues.length > 0 && (
            <div
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-xs"
              role="alert"
            >
              {issues.map((issue) => (
                <p key={`${issue.field}-${issue.message}`}>
                  <strong>{issue.field}</strong>: {issue.message}
                </p>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">
              {validationStatus === "valid"
                ? "WMO checks passed for the current workbook."
                : "Validate before saving to identify WMO field errors."}
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
              <Button disabled={saveStatus === "saving"} type="submit">
                <Save />
                {saveStatus === "saving" ? "Saving…" : "Save draft"}
              </Button>
            </div>
          </div>
          {saveStatus === "saved" && (
            <p className="text-muted-foreground text-xs" role="status">
              Draft saved to eRegister. QC approval is still required.
            </p>
          )}
          {saveStatus === "error" && (
            <p className="text-destructive text-xs" role="alert">
              Draft could not be saved. Check the API and try again.
            </p>
          )}
        </form>
      </SectionCard>
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
