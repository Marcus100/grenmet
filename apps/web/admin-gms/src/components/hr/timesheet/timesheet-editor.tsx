"use client";

import {
  readMyTimesheetsApiV1HrTimesheetsMeGetQueryKey,
  type TimesheetEntryInput,
  useCreateTimesheetApiV1HrTimesheetsPost,
  useReadHrProfileMeApiV1HrProfileMeGet,
} from "@grenmet/api-client";
import { Button } from "@grenmet/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@grenmet/ui/components/ui/field";
import { Input } from "@grenmet/ui/components/ui/input";
import { Separator } from "@grenmet/ui/components/ui/separator";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DatePicker } from "@/components/document/date-picker";
import { DocumentPreview } from "@/components/document/document-preview";
import { useEditorPrefill } from "@/components/hr/use-editor-prefill";
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

export function TimesheetEditor() {
  const form = useForm({ defaultValues: EMPTY_TIMESHEET });
  const queryClient = useQueryClient();
  const profileQuery = useReadHrProfileMeApiV1HrProfileMeGet();
  const departmentId = profileQuery.data?.employment?.department?.id;
  const createMutation = useCreateTimesheetApiV1HrTimesheetsPost();

  // Prefill the (blank) department field with the current user's department.
  useEditorPrefill((ctx) => {
    if (!form.getFieldValue("department")) {
      form.setFieldValue("department", ctx.department);
    }
  });

  async function submitToHr(values: typeof EMPTY_TIMESHEET) {
    const rows = values.rows.filter((row) => !isRowEmpty(row));
    if (rows.length === 0) {
      toast.error("Add at least one entry before submitting");
      return;
    }
    const dates = rows.map((row) => row.date).sort();
    const periodStart = dates.at(0);
    const periodEnd = dates.at(-1);
    if (!(periodStart && periodEnd)) {
      toast.error("Every entry needs a date");
      return;
    }
    if (!departmentId) {
      toast.error("Your employment record has no department — contact HR");
      return;
    }
    try {
      await createMutation.mutateAsync({
        data: {
          department_id: departmentId,
          period_start: periodStart,
          period_end: periodEnd,
          entries: rows.map(toEntry),
        },
      });
      await queryClient.invalidateQueries({
        queryKey: readMyTimesheetsApiV1HrTimesheetsMeGetQueryKey(),
      });
      toast.success("Time sheet submitted");
      form.reset();
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(`Submission failed: ${detail}`);
    }
  }

  return (
    <form.Subscribe selector={(s) => s.values}>
      {(values) => (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-lg">Official Time Sheet</h2>
              <div className="flex gap-2">
                <Button
                  onClick={() => form.reset()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RotateCcw data-icon="inline-start" />
                  Reset
                </Button>
                <Button
                  disabled={createMutation.isPending}
                  onClick={() => submitToHr(values)}
                  size="sm"
                  type="button"
                >
                  <Send data-icon="inline-start" />
                  {createMutation.isPending ? "Submitting…" : "Submit to HR"}
                </Button>
              </div>
            </div>

            <Separator />

            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                form.handleSubmit();
              }}
            >
              <FieldGroup>
                <div className="grid gap-5 md:grid-cols-2">
                  <form.Field name="department">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Department
                        </FieldLabel>
                        <Input
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name="period">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Period
                        </FieldLabel>
                        <Input
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>
                </div>
              </FieldGroup>

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
          </div>

          <DocumentPreview title="Official Time Sheet">
            <TimesheetDocument values={values} />
          </DocumentPreview>
        </div>
      )}
    </form.Subscribe>
  );
}
