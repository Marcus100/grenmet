"use client";

import {
  hrGetMyTimesheetsQueryKey,
  hrGetTimesheetPrefill,
  type RosterRuleWarningsErrorPublic,
  type TimesheetEntryInput,
  type TimesheetPrefillEntry,
  useHrCreateTimesheet,
  useHrDeleteDraftTimesheet,
  useHrGetHrProfileMe,
  useHrSubmitTimesheet,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Separator } from "@barrelsgd/ui/components/ui/separator";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarClock, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DatePicker } from "@/components/document/date-picker";
import { DocumentPreview } from "@/components/document/document-preview";
import { HrFormDesk } from "@/components/hr/hr-form-desk";
import {
  EmployeeNumberField,
  PrefillInput,
  SourceHint,
} from "@/components/hr/prefill-field";
import {
  signedDocumentsKey,
  useSigning,
} from "@/components/hr/signatures/signature-api";
import { SigningPanel } from "@/components/hr/signatures/signing-panel";
import type { SubmissionMetadata } from "@/components/hr/submission-date";
import {
  useEditorPrefill,
  useProfileReference,
} from "@/components/hr/use-editor-prefill";
import { reportError } from "@/lib/report-error";
import { ruleWarningsFrom } from "../roster/rule-codes";
import { RuleOverrideDialog } from "../roster/rule-override-dialog";
import {
  EMPTY_TIMESHEET,
  EMPTY_TIMESHEET_ROW,
  TIMESHEET_COLUMNS,
  TimesheetDocument,
  type TimesheetRow,
} from "./timesheet-document";

/** A row counts as empty when every editable column is blank. */
function isRowEmpty(row: TimesheetRow): boolean {
  return TIMESHEET_COLUMNS.every(({ key }) => !row[key].trim());
}

/** Paper-form row → API timesheet entry. `name` is print-only (per-user API). */
function toEntry(row: TimesheetRow): TimesheetEntryInput {
  return {
    entry_date: row.date,
    roster_hours: row.rosterHours.trim() || undefined,
    actual_hours: row.actualHours.trim() || undefined,
    total_hours: row.totalHours.trim() || undefined,
    break_hours: row.breakHours.trim() || undefined,
    hours_worked: row.hoursWorked.trim() || undefined,
    comments: row.remarks.trim() || undefined,
  };
}

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

const REMARK_BY_AVAILABILITY: Record<string, string> = {
  ABSENT: "Approved absence",
  LEAVE: "Approved leave",
  PARTIAL_ABSENCE: "Part-day absence",
};

/**
 * A published-roster shift as a timesheet row. Actual hours start at the
 * scheduled hours, or zero when approved leave or absence covers the shift;
 * the employee edits them to what was really worked.
 */
export function rosterEntryToRow(
  entry: TimesheetPrefillEntry,
  name: string
): TimesheetRow {
  const availability = entry.availability ?? "SCHEDULED";
  const worked =
    availability === "LEAVE" || availability === "ABSENT"
      ? "0"
      : entry.roster_hours;
  return {
    ...EMPTY_TIMESHEET_ROW,
    id: crypto.randomUUID(),
    date: entry.entry_date,
    name,
    rosterHours: entry.roster_hours,
    actualHours: worked,
    totalHours: worked,
    hoursWorked: worked,
    remarks: [
      entry.shift_code,
      REMARK_BY_AVAILABILITY[availability],
      entry.holiday_name
        ? `Public holiday: ${entry.holiday_name}${
            entry.holiday_provisional ? " (provisional, HR to verify)" : ""
          }`
        : undefined,
    ]
      .filter(Boolean)
      .join(" - "),
  };
}

export function TimesheetEditor() {
  const form = useForm({ defaultValues: EMPTY_TIMESHEET });
  const queryClient = useQueryClient();
  const signature = useSigning();
  const profileQuery = useHrGetHrProfileMe();
  const departmentId = profileQuery.data?.employment?.department?.id;
  const createMutation = useHrCreateTimesheet();
  const deleteDraftMutation = useHrDeleteDraftTimesheet();

  const submitMutation = useHrSubmitTimesheet();
  // A submission the approval template approves at once, breaking roster
  // rules: it waits for the submitter's reason.
  const [override, setOverride] = useState<{
    values: typeof EMPTY_TIMESHEET;
    warnings: RosterRuleWarningsErrorPublic;
  } | null>(null);
  const reference = useProfileReference();
  const [rosterMonth, setRosterMonth] = useState(format(new Date(), "yyyy-MM"));
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterNote, setRosterNote] = useState<string | null>(null);
  const [savedTimesheetId, setSavedTimesheetId] = useState<string | null>(null);
  // What the saved draft holds, so an edited form replaces it (no duplicates).
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);
  const [submission, setSubmission] = useState<SubmissionMetadata | null>(null);
  function reset() {
    form.reset();
    setRosterNote(null);
    setSavedTimesheetId(null);
    setSavedFingerprint(null);
    setOverride(null);
    setSubmission(null);
  }

  // Prefill the (blank) department field with the current user's department.
  useEditorPrefill((ctx) => {
    if (!form.getFieldValue("department")) {
      form.setFieldValue("department", ctx.department);
    }
  });

  async function fillFromRoster() {
    if (!MONTH_PATTERN.test(rosterMonth)) {
      toast.error("Choose a month first");
      return;
    }
    setRosterBusy(true);
    try {
      const prefill = await hrGetTimesheetPrefill({
        query: { period: rosterMonth },
      }).unwrap();
      if (prefill.entries.length === 0) {
        setRosterNote(null);
        toast.info("No published roster shifts for that month");
        return;
      }
      const have = new Set(
        form.getFieldValue("rows").map((row: TimesheetRow) => row.date)
      );
      const added = prefill.entries
        .filter((entry) => !have.has(entry.entry_date))
        .map((entry) => rosterEntryToRow(entry, reference.fullName));
      form.setFieldValue("rows", (rows: TimesheetRow[]) => [...rows, ...added]);
      if (!form.getFieldValue("period")) {
        form.setFieldValue(
          "period",
          format(new Date(`${rosterMonth}-01T00:00:00`), "MMMM yyyy")
        );
      }
      const holidayDays = prefill.entries.filter((entry) => entry.holiday_name);
      const holidayNote =
        holidayDays.length > 0
          ? ` ${holidayDays.length} rostered ${
              holidayDays.length === 1 ? "day is a" : "days are"
            } public ${
              holidayDays.length === 1 ? "holiday" : "holidays"
            } (marked in remarks; pay treatment is for HR to decide).`
          : "";
      setRosterNote(
        `${added.length} of ${prefill.entries.length} rostered shifts added from your published roster. Scheduled hours are copied into actual hours; edit them to what you worked.${holidayNote}`
      );
    } catch (error) {
      reportError(error, "hr-timesheet-roster-prefill");
      toast.error("Could not load your roster. Try again.");
    } finally {
      setRosterBusy(false);
    }
  }

  /** Returns false when the submission failed, so a typed override reason is kept. */
  async function submitToHr(
    values: typeof EMPTY_TIMESHEET,
    ruleReason?: string
  ): Promise<boolean> {
    if (!signature.data) {
      toast.error("Save your signature in your profile before signing");
      return false;
    }
    const rows = values.rows.filter((row) => !isRowEmpty(row));
    if (rows.length === 0) {
      toast.error("Add at least one entry before submitting");
      return false;
    }
    const dates = rows.map((row) => row.date).sort();
    const periodStart = dates.at(0);
    const periodEnd = dates.at(-1);
    if (!(periodStart && periodEnd)) {
      toast.error("Every entry needs a date");
      return false;
    }
    if (!departmentId) {
      toast.error("Your employment record has no department — contact HR");
      return false;
    }
    try {
      const entries = rows.map(toEntry);
      const fingerprint = JSON.stringify({
        departmentId,
        periodStart,
        periodEnd,
        entries,
      });
      let timesheetId = savedTimesheetId;
      if (timesheetId && savedFingerprint !== fingerprint) {
        // The form changed after the draft was saved (for example the user
        // cancelled the rule override dialog to fix the hours): replace the
        // draft rather than submit stale entries or leave a duplicate.
        await deleteDraftMutation.mutateAsync({
          path: { timesheet_id: timesheetId },
        });
        timesheetId = null;
        setSavedTimesheetId(null);
        setSavedFingerprint(null);
      }
      if (!timesheetId) {
        const created = await createMutation.mutateAsync({
          body: {
            department_id: departmentId,
            period_start: periodStart,
            period_end: periodEnd,
            entries,
          },
        });
        timesheetId = created.timesheet.id;
        setSavedTimesheetId(timesheetId);
        setSavedFingerprint(fingerprint);
      }
      if (!timesheetId) throw new Error("The saved timesheet has no ID");
      const submitted = await submitMutation.mutateAsync({
        path: { timesheet_id: timesheetId },
        body: {
          mode: "SELF",
          signature_version: signature.data.version,
          ...(ruleReason ? { rule_override_reason: ruleReason } : {}),
        },
      });
      setOverride(null);
      setSubmission(submitted);
      await queryClient.invalidateQueries({ queryKey: signedDocumentsKey });
      await queryClient.invalidateQueries({
        queryKey: hrGetMyTimesheetsQueryKey({}),
      });
      toast.success("Time sheet submitted");
      return true;
    } catch (error) {
      const warnings = ruleWarningsFrom(error);
      if (warnings) {
        setOverride({ values, warnings });
        return false;
      }
      // Any other failure closes the dialog; the typed reason is kept.
      setOverride(null);
      const detail =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(`Submission failed: ${detail}`);
      return false;
    }
  }

  return (
    <form.Subscribe selector={(s) => s.values}>
      {(values) => (
        <HrFormDesk
          editor={
            <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
              <RuleOverrideDialog
                busy={
                  createMutation.isPending ||
                  submitMutation.isPending ||
                  deleteDraftMutation.isPending
                }
                defaultLabel="You"
                onCancel={() => setOverride(null)}
                onConfirm={(ruleReason) =>
                  override ? submitToHr(override.values, ruleReason) : false
                }
                warnings={override?.warnings ?? null}
              />
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-lg">Official Time Sheet</h2>
                <div className="flex gap-2">
                  <Button
                    disabled={
                      createMutation.isPending || submitMutation.isPending
                    }
                    onClick={reset}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <RotateCcw data-icon="inline-start" />
                    Reset
                  </Button>
                  <Button
                    disabled={
                      createMutation.isPending ||
                      submitMutation.isPending ||
                      Boolean(submission) ||
                      !signature.data
                    }
                    onClick={() => submitToHr(values)}
                    size="sm"
                    type="button"
                  >
                    <Send data-icon="inline-start" />
                    {createMutation.isPending || submitMutation.isPending
                      ? "Submitting…"
                      : "Sign & submit"}
                  </Button>
                </div>
              </div>

              <SigningPanel submission={submission} />
              <Separator />

              {!submission && (
                <form
                  className="flex flex-col gap-4"
                  inert={createMutation.isPending || submitMutation.isPending}
                  onSubmit={(e) => {
                    e.preventDefault();
                    form.handleSubmit();
                  }}
                >
                  <FieldGroup>
                    <EmployeeNumberField value={reference.employeeNumber} />
                    <div className="grid gap-5 md:grid-cols-2">
                      <form.Field name="department">
                        {(field) => (
                          <PrefillInput
                            id={field.name}
                            label="Department"
                            locked
                            onChange={field.handleChange}
                            value={field.state.value}
                          />
                        )}
                      </form.Field>
                      <form.Field name="period">
                        {(field) => (
                          <Field className="gap-1">
                            <FieldLabel
                              className="text-xs"
                              htmlFor={field.name}
                            >
                              Period
                            </FieldLabel>
                            <Input
                              id={field.name}
                              onChange={(e) =>
                                field.handleChange(e.target.value)
                              }
                              value={field.state.value}
                            />
                          </Field>
                        )}
                      </form.Field>
                    </div>
                  </FieldGroup>

                  <div className="flex flex-wrap items-end gap-2">
                    <Field className="w-44 gap-1">
                      <FieldLabel className="text-xs" htmlFor="roster-month">
                        Roster month
                      </FieldLabel>
                      <Input
                        id="roster-month"
                        onChange={(event) => setRosterMonth(event.target.value)}
                        type="month"
                        value={rosterMonth}
                      />
                    </Field>
                    <Button
                      disabled={rosterBusy}
                      onClick={fillFromRoster}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <CalendarClock data-icon="inline-start" />
                      {rosterBusy ? "Loading…" : "Fill from roster"}
                    </Button>
                  </div>
                  {rosterNote ? <SourceHint>{rosterNote}</SourceHint> : null}

                  <Separator />

                  <form.Field mode="array" name="rows">
                    {(rowsField) => (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <FieldLabel>Entries</FieldLabel>
                          <Button
                            onClick={() =>
                              rowsField.pushValue({
                                ...EMPTY_TIMESHEET_ROW,
                                id: crypto.randomUUID(),
                              })
                            }
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <Plus data-icon="inline-start" />
                            Add entry
                          </Button>
                        </div>

                        {rowsField.state.value.map((row, i) => (
                          <div
                            className="flex flex-col gap-3 rounded-md border p-3"
                            key={row.id}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">
                                Entry {i + 1}
                              </span>
                              <Button
                                onClick={() => rowsField.removeValue(i)}
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              {TIMESHEET_COLUMNS.map((col) => (
                                <form.Field
                                  key={col.key}
                                  name={`rows[${i}].${col.key}`}
                                >
                                  {(field) => (
                                    <Field className="gap-1">
                                      <FieldLabel
                                        className="text-xs"
                                        htmlFor={field.name}
                                      >
                                        {col.label}
                                      </FieldLabel>
                                      {col.key === "date" ? (
                                        <DatePicker
                                          id={field.name}
                                          onChange={field.handleChange}
                                          value={field.state.value}
                                        />
                                      ) : (
                                        <Input
                                          id={field.name}
                                          onChange={(e) =>
                                            field.handleChange(e.target.value)
                                          }
                                          value={field.state.value}
                                        />
                                      )}
                                    </Field>
                                  )}
                                </form.Field>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </form.Field>
                </form>
              )}
            </div>
          }
          entityType="timesheet"
          label="Official Time Sheet"
          preview={
            <DocumentPreview
              autoRender={Boolean(submission)}
              inputKey={JSON.stringify([
                values,
                submission?.signed_document_id,
              ])}
              showDownloadPdf={!submission?.signed_document_id}
              title="Official Time Sheet preview"
            >
              <TimesheetDocument submission={submission} values={values} />
            </DocumentPreview>
          }
        />
      )}
    </form.Subscribe>
  );
}
