"use client";

import {
  hrGetStatusReportsQueryKey,
  type PersonnelStatus,
  type StatusReportCreate,
  type StatusReportPublic,
  type StatusStaffingEntry,
  useHrCreateStatusReport,
  useHrGetHrProfileMe,
  useHrGetStatusReport,
  useHrGetStatusStaffing,
  useHrSubmitStatusReport,
  useHrUpdateStatusReport,
} from "@barrelsgd/api-client";
import { useSessionUser } from "@barrelsgd/auth";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { Separator } from "@barrelsgd/ui/components/ui/separator";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DatePicker } from "@/components/document/date-picker";
import { hrApiErrorMessage } from "@/components/hr/api-error";
import { CoApproverPicker } from "@/components/hr/co-approver-picker";
import { FormActionBar } from "@/components/hr/form-action-bar";
import { downloadHrPdf, HrPdfPreview } from "@/components/hr/hr-pdf-preview";
import {
  signedDocumentsKey,
  useSigning,
} from "@/components/hr/signatures/signature-api";
import { SigningPanel } from "@/components/hr/signatures/signing-panel";
import type { SubmissionMetadata } from "@/components/hr/submission-date";
import { useEditorPrefill } from "@/components/hr/use-editor-prefill";
import { reportError } from "@/lib/report-error";
import {
  type DailyStatusEntry,
  type DailyStatusValues,
  EMPTY_DAILY_STATUS,
  SHIFT_OPTIONS,
  YES_NO,
} from "./daily-status-document";

export function buildStatusReportPayload(
  values: DailyStatusValues,
  departmentId: string
): StatusReportCreate {
  return {
    department_id: departmentId,
    report_date: values.date,
    shift_code: values.shift,
    entries: values.entries,
    all_equipment_operational: values.equipmentOperational
      ? values.equipmentOperational === "Yes"
      : undefined,
    equipment_issue_reason:
      values.equipmentOperational === "No"
        ? values.equipmentReason || undefined
        : undefined,
    equipment_remedy_action:
      values.equipmentOperational === "No"
        ? values.equipmentRemedy || undefined
        : undefined,
    incident_reports_submitted: values.incidentsSubmitted
      ? values.incidentsSubmitted === "Yes"
      : undefined,
    incident_explanation:
      values.incidentsSubmitted === "No"
        ? values.incidentExplain || undefined
        : undefined,
    all_personnel_reported_on_time: values.allReported
      ? values.allReported === "Yes"
      : undefined,
    personnel_explanation:
      values.allReported === "No"
        ? values.notReportedExplain || undefined
        : undefined,
    affected_operations: values.affectedEfficiency === "Yes",
    affected_operations_explanation:
      values.affectedEfficiency === "Yes"
        ? values.affectedExplain || undefined
        : undefined,
    personnel_summary: values.absenteeism || undefined,
    general_remarks: values.comments || undefined,
  };
}

/** Map a saved report back onto the paper-form fields when reopening a draft. */
function answerToField(answer: boolean | null | undefined) {
  if (answer == null) return "";
  return answer ? "Yes" : "No";
}

function draftToFormValues(report: StatusReportPublic): DailyStatusValues {
  return {
    ...EMPTY_DAILY_STATUS,
    date: report.report_date ?? "",
    shift:
      ({ AM: "M", PM: "E" } as Record<string, string>)[report.shift_code] ??
      report.shift_code,
    equipmentOperational: answerToField(report.all_equipment_operational),
    equipmentReason: report.equipment_issue_reason ?? "",
    equipmentRemedy: report.equipment_remedy_action ?? "",
    incidentsSubmitted: answerToField(report.incident_reports_submitted),
    incidentExplain: report.incident_explanation ?? "",
    absenteeism: report.personnel_summary ?? "",
    allReported: answerToField(report.all_personnel_reported_on_time),
    notReportedExplain: report.personnel_explanation ?? "",
    affectedEfficiency: report.affected_operations ? "Yes" : "No",
    affectedExplain: report.affected_operations_explanation ?? "",
    comments: report.general_remarks ?? "",
  };
}

export function DailyStatusEditor() {
  const form = useForm({ defaultValues: EMPTY_DAILY_STATUS });
  const queryClient = useQueryClient();
  const signature = useSigning();
  const sessionUser = useSessionUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftParam = searchParams.get("draft");
  const profileQuery = useHrGetHrProfileMe();
  const departmentId = profileQuery.data?.employment?.department?.id;
  const draftQuery = useHrGetStatusReport(
    { path: { report_id: draftParam ?? "" } },
    { query: { enabled: Boolean(draftParam) } }
  );
  const createMutation = useHrCreateStatusReport();
  const updateMutation = useHrUpdateStatusReport();
  const submitMutation = useHrSubmitStatusReport();
  const [submission, setSubmission] = useState<SubmissionMetadata | null>(null);
  const [coApprovers, setCoApprovers] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(draftParam);
  const [pendingAction, setPendingAction] = useState<"save" | "submit" | null>(
    null
  );
  const loadedDraftRef = useRef<string | null>(null);

  // When arriving via ?draft=<id>, load that draft into the form once.
  useEffect(() => {
    if (!draftParam || loadedDraftRef.current === draftParam) {
      return;
    }
    const saved = draftQuery.data;
    if (!saved) {
      return;
    }
    const draft = saved.report;
    if (draft) {
      form.reset(
        {
          ...draftToFormValues(draft),
          department: profileQuery.data?.employment?.department?.name ?? "",
          entries: saved.entries.map(
            ({
              user_id,
              personnel_status,
              arrival_time,
              departure_time,
              notes,
              employee_name,
            }) => ({
              user_id,
              personnel_status,
              arrival_time,
              departure_time,
              notes,
              employee_name,
            })
          ),
        },
        { keepDefaultValues: true }
      );
      setDraftId(draftParam);
      setSubmission(draft.status === "DRAFT" ? null : draft);
      setStatusHint(
        draft.status === "DRAFT"
          ? "Editing saved draft"
          : "Submitted copy — Reset to start a new form"
      );
      loadedDraftRef.current = draftParam;
    }
  }, [draftParam, draftQuery.data, profileQuery.data, form]);

  // Prefill blank fields with the current user's department and today's date.
  useEditorPrefill(
    (ctx) => {
      if (!form.getFieldValue("department")) {
        form.setFieldValue("department", ctx.department);
      }
      if (!form.getFieldValue("date")) {
        form.setFieldValue("date", ctx.today);
      }
    },
    { skip: Boolean(draftParam) }
  );

  function handleReset() {
    setSubmission(null);
    form.reset();
    setCoApprovers([]);
    setStatusHint(null);
    setDraftId(null);
    loadedDraftRef.current = null;
    if (searchParams.get("draft")) {
      router.replace("/hr/status");
    }
  }

  async function handleDownloadPdf() {
    if (!(departmentId && form.getFieldValue("date"))) return;
    try {
      await downloadHrPdf({
        payload: buildStatusReportPayload(form.state.values, departmentId),
        previewPath: "/api/v1/hr/status-reports/preview-pdf",
        signedDocumentId: submission?.signed_document_id,
        filename: `daily-status-${form.getFieldValue("date")}.pdf`,
      });
    } catch (error) {
      reportError(error, "hr-status-download");
      toast.error(hrApiErrorMessage(error));
    }
  }

  async function refreshMyReports() {
    await queryClient.invalidateQueries({
      queryKey: hrGetStatusReportsQueryKey({}),
    });
  }

  async function persist(values: DailyStatusValues, asDraft: boolean) {
    setValidationError(null);
    const validation = validateStatusValues(values, !asDraft);
    if (validation) {
      setValidationError(validation);
      toast.error(validation);
      return;
    }
    if (!(asDraft || signature.data)) {
      toast.error("Save your signature in your profile before signing");
      return;
    }
    if (!(asDraft || values.date)) {
      toast.error("Report date is required");
      return;
    }
    if (!departmentId) {
      toast.error("Your employment record has no department — contact HR");
      return;
    }
    setPendingAction(asDraft ? "save" : "submit");
    try {
      if (asDraft) {
        if (draftId) {
          await updateMutation.mutateAsync({
            path: { report_id: draftId },
            body: {
              ...buildStatusReportPayload(values, departmentId),
              as_draft: true,
            },
          });
          setStatusHint("Draft updated");
          toast.success("Draft updated");
        } else {
          const created = await createMutation.mutateAsync({
            body: {
              ...buildStatusReportPayload(values, departmentId),
              as_draft: true,
              co_approver_user_ids: [],
            },
          });
          setDraftId(created.report.id);
          loadedDraftRef.current = created.report.id;
          setStatusHint("Draft saved");
          toast.success("Draft saved");
        }
      } else {
        if (draftId) {
          await updateMutation.mutateAsync({
            path: { report_id: draftId },
            body: {
              ...buildStatusReportPayload(values, departmentId),
              as_draft: true,
            },
          });
          const submitted = await submitMutation.mutateAsync({
            path: { report_id: draftId },
            body: {
              signature_version: signature.data?.version,
              co_approver_user_ids: coApprovers,
            },
          });
          setSubmission(submitted);
          await queryClient.invalidateQueries({ queryKey: signedDocumentsKey });
        } else {
          const submitted = await createMutation.mutateAsync({
            body: {
              ...buildStatusReportPayload(values, departmentId),
              as_draft: false,
              signature_version: signature.data?.version,
              co_approver_user_ids: coApprovers,
            },
          });
          setSubmission(submitted.report);
        }
        toast.success("Status report submitted");
        setStatusHint("Submitted copy — Reset to start a new form");
      }
      await refreshMyReports();
    } catch (error) {
      reportError(error, "hr-status-submit");
      const detail = hrApiErrorMessage(error);
      setValidationError(detail);
      toast.error(`${asDraft ? "Save" : "Submission"} failed: ${detail}`);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <form.Subscribe selector={(s) => s.values}>
      {(values) => (
        <div className="grid @4xl:grid-cols-2 items-start gap-5">
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
            <div className="flex flex-col gap-3">
              <SigningPanel submission={submission} />
              <FormActionBar
                isSaving={pendingAction === "save"}
                isSubmitting={pendingAction === "submit"}
                onDownloadPdf={handleDownloadPdf}
                onReset={handleReset}
                onSave={submission ? undefined : () => persist(values, true)}
                onSubmit={submission ? undefined : () => persist(values, false)}
                statusHint={statusHint}
                submitDisabled={!(departmentId && signature.data)}
                submitLabel="Sign & submit"
              />
            </div>

            {validationError && (
              <p className="text-destructive text-sm" role="alert">
                {validationError}
              </p>
            )}
            <Separator />

            {!submission && (
              <form
                className="flex flex-col gap-4"
                inert={pendingAction !== null}
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
                            readOnly
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>
                    <form.Field name="date">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Date
                          </FieldLabel>
                          <DatePicker
                            id={field.name}
                            onChange={(date) => {
                              field.handleChange(date);
                              form.setFieldValue("entries", []);
                            }}
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>
                    <form.Field name="shift">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Shift
                          </FieldLabel>
                          <NativeSelect
                            id={field.name}
                            onChange={(event) => {
                              field.handleChange(event.target.value);
                              form.setFieldValue("entries", []);
                            }}
                            value={field.state.value}
                          >
                            <NativeSelectOption value="">
                              Confirm answer
                            </NativeSelectOption>
                            {SHIFT_OPTIONS.map((s) => (
                              <NativeSelectOption key={s} value={s}>
                                {s}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </Field>
                      )}
                    </form.Field>
                    <form.Field name="absenteeism">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Absenteeism
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

                  <form.Field name="allReported">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          All persons reported on time?
                        </FieldLabel>
                        <NativeSelect
                          id={field.name}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          value={field.state.value}
                        >
                          <NativeSelectOption value="">
                            Confirm answer
                          </NativeSelectOption>
                          {YES_NO.map((v) => (
                            <NativeSelectOption key={v} value={v}>
                              {v}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                    )}
                  </form.Field>

                  {values.allReported === "No" ? (
                    <form.Field name="notReportedExplain">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            If No, explain
                          </FieldLabel>
                          <Input
                            id={field.name}
                            onChange={(e) => field.handleChange(e.target.value)}
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>
                  ) : null}

                  <form.Field name="affectedEfficiency">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Affected status / efficiency of operations?
                        </FieldLabel>
                        <NativeSelect
                          id={field.name}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          value={field.state.value}
                        >
                          <NativeSelectOption value="">
                            Confirm answer
                          </NativeSelectOption>
                          {YES_NO.map((v) => (
                            <NativeSelectOption key={v} value={v}>
                              {v}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                    )}
                  </form.Field>

                  {values.affectedEfficiency === "Yes" ? (
                    <form.Field name="affectedExplain">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            If Yes, explain
                          </FieldLabel>
                          <Input
                            id={field.name}
                            onChange={(e) => field.handleChange(e.target.value)}
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>
                  ) : null}

                  <form.Field name="comments">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Operational status comments
                        </FieldLabel>
                        <Textarea
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          rows={4}
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>

                  <StatusStaffing
                    date={values.date}
                    departmentId={departmentId}
                    entries={values.entries}
                    onChange={(entries) =>
                      form.setFieldValue("entries", entries)
                    }
                    shift={values.shift}
                  />
                  {(
                    [
                      ["equipmentOperational", "All equipment operational?"],
                      [
                        "incidentsSubmitted",
                        "All incident / accident reports submitted?",
                      ],
                    ] as const
                  ).map(([name, label]) => (
                    <form.Field key={name} name={name}>
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor={name}>{label}</FieldLabel>
                          <NativeSelect
                            id={name}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            value={field.state.value}
                          >
                            <NativeSelectOption value="">
                              Confirm answer
                            </NativeSelectOption>
                            {YES_NO.map((answer) => (
                              <NativeSelectOption key={answer} value={answer}>
                                {answer}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </Field>
                      )}
                    </form.Field>
                  ))}
                  {values.equipmentOperational === "No" &&
                    (
                      [
                        ["equipmentReason", "Equipment issue reason"],
                        [
                          "equipmentRemedy",
                          "Equipment remedy / action pending",
                        ],
                      ] as const
                    ).map(([name, label]) => (
                      <form.Field key={name} name={name}>
                        {(field) => (
                          <Field>
                            <FieldLabel htmlFor={name}>{label}</FieldLabel>
                            <Textarea
                              id={name}
                              maxLength={1000}
                              onChange={(event) =>
                                field.handleChange(event.target.value)
                              }
                              value={field.state.value}
                            />
                          </Field>
                        )}
                      </form.Field>
                    ))}
                  {values.incidentsSubmitted === "No" && (
                    <form.Field name="incidentExplain">
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor="incidentExplain">
                            Reason incident reports remain outstanding
                          </FieldLabel>
                          <Textarea
                            id="incidentExplain"
                            maxLength={1000}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>
                  )}
                  <Field className="gap-1">
                    <FieldLabel className="text-xs">
                      Co-approvers (all must approve before it reaches HR)
                    </FieldLabel>
                    <CoApproverPicker
                      departmentId={departmentId}
                      excludeUserId={sessionUser.id}
                      onChange={setCoApprovers}
                      selected={coApprovers}
                    />
                  </Field>
                </FieldGroup>
              </form>
            )}
          </div>

          <HrPdfPreview
            payload={
              departmentId ? buildStatusReportPayload(values, departmentId) : {}
            }
            previewPath="/api/v1/hr/status-reports/preview-pdf"
            ready={Boolean(departmentId && values.date)}
            signedDocumentId={submission?.signed_document_id}
            title="Daily Airport Status Report"
          />
        </div>
      )}
    </form.Subscribe>
  );
}

export function validateStatusValues(
  values: DailyStatusValues,
  submitting: boolean
): string | null {
  if (!values.date) return "Report date is required";
  if (!SHIFT_OPTIONS.includes(values.shift)) return "Choose M, E or N";
  if (!submitting) return null;
  if (
    !(
      values.allReported &&
      values.affectedEfficiency &&
      values.equipmentOperational &&
      values.incidentsSubmitted
    )
  )
    return "Confirm the personnel, operations, equipment and incident answers";
  if (values.entries.some((entry) => entry.personnel_status === "UNCONFIRMED"))
    return "Confirm each employee's shift status before submitting";
  if (values.allReported === "No" && !values.notReportedExplain.trim())
    return "Explain personnel who did not report on time";
  if (values.affectedEfficiency === "Yes" && !values.affectedExplain.trim())
    return "Explain the affected operations";
  if (
    values.equipmentOperational === "No" &&
    !(values.equipmentReason.trim() && values.equipmentRemedy.trim())
  )
    return "Record the equipment issue and remedy or action pending";
  if (values.incidentsSubmitted === "No" && !values.incidentExplain.trim())
    return "Explain why incident reports are outstanding";
  return null;
}

function StatusStaffing({
  departmentId,
  date,
  shift,
  entries,
  onChange,
}: {
  departmentId?: string;
  date: string;
  shift: string;
  entries: DailyStatusEntry[];
  onChange: (entries: DailyStatusEntry[]) => void;
}) {
  const query = useHrGetStatusStaffing(
    {
      query: {
        department_id: departmentId ?? "",
        report_date: date,
        shift_code: shift,
      },
    },
    {
      query: {
        enabled: Boolean(departmentId && date && SHIFT_OPTIONS.includes(shift)),
      },
    }
  );
  const context = `${departmentId}/${date}/${shift}`;
  const filledContext = useRef<string | null>(null);
  useEffect(() => {
    if (!query.data || entries.length || filledContext.current === context)
      return;
    filledContext.current = context;
    onChange(query.data.entries.map(staffingEntry));
  }, [query.data, entries.length, context, onChange]);
  const names = new Map(
    query.data?.entries.map((row) => [row.user_id, row]) ?? []
  );
  const statuses: PersonnelStatus[] = [
    "UNCONFIRMED",
    "PRESENT",
    "LATE",
    "ABSENT",
    "ON_LEAVE",
    "EXCUSED",
  ];
  function update(index: number, patch: Partial<DailyStatusEntry>) {
    onChange(
      entries.map((entry, at) =>
        at === index ? { ...entry, ...patch } : entry
      )
    );
  }
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Shift personnel</h2>
      <p className="text-muted-foreground text-xs">
        Published roster and approved absence / leave. Confirm actual status;
        scheduled hours do not establish attendance. D remains a D assignment in
        M/E coverage.
      </p>
      {query.isError && (
        <p className="text-destructive text-sm" role="alert">
          Staffing could not be loaded. Retry before completing the report.
        </p>
      )}
      <Button
        onClick={() => {
          if (query.data) onChange(query.data.entries.map(staffingEntry));
        }}
        type="button"
        variant="outline"
      >
        Refresh from roster
      </Button>
      {entries.map((entry, index) => {
        const row = names.get(entry.user_id);
        const label =
          row?.employee_name ?? entry.employee_name ?? entry.user_id;
        return (
          <div className="space-y-2 rounded-lg border p-3" key={entry.user_id}>
            <p className="font-medium text-sm">
              {label}{" "}
              {row && (
                <span className="text-muted-foreground">
                  · scheduled {row.scheduled_shift_code} ·{" "}
                  {row.availability.replaceAll("_", " ").toLowerCase()}
                </span>
              )}
            </p>
            {row?.attendance_id && (
              <p className="text-muted-foreground text-xs">
                Employee-recorded attendance ·{" "}
                {row.attendance_review_status ?? "not submitted"}.
                {row.arrived_at &&
                  ` Arrival ${attendanceLocalTime(row.arrived_at)}.`}
                {row.departed_at &&
                  ` Departure ${attendanceLocalTime(row.departed_at)}.`}{" "}
                Report observations do not change the employee’s attendance
                record.
              </p>
            )}
            <label className="text-xs" htmlFor={`status-${entry.user_id}`}>
              Reported status
            </label>
            <NativeSelect
              id={`status-${entry.user_id}`}
              onChange={(event) =>
                update(index, {
                  personnel_status: event.target.value as PersonnelStatus,
                })
              }
              value={entry.personnel_status}
            >
              {statuses.map((status) => (
                <NativeSelectOption key={status} value={status}>
                  {status.replaceAll("_", " ").toLowerCase()}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ["arrival_time", "Arrival"],
                  ["departure_time", "Departure"],
                ] as const
              ).map(([key, title]) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`${key}-${entry.user_id}`}>
                    {title}
                  </FieldLabel>
                  <Input
                    id={`${key}-${entry.user_id}`}
                    onChange={(event) =>
                      update(index, { [key]: event.target.value || null })
                    }
                    type="time"
                    value={entry[key] ?? ""}
                  />
                </Field>
              ))}
            </div>
            <Field>
              <FieldLabel htmlFor={`notes-${entry.user_id}`}>
                Personnel notes
              </FieldLabel>
              <Textarea
                id={`notes-${entry.user_id}`}
                maxLength={500}
                onChange={(event) =>
                  update(index, { notes: event.target.value || null })
                }
                value={entry.notes ?? ""}
              />
            </Field>
          </div>
        );
      })}
      {!query.isLoading && entries.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No published staffing for this shift.
        </p>
      )}
    </section>
  );
}

function attendanceLocalTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Grenada",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function staffingEntry(row: StatusStaffingEntry): DailyStatusEntry {
  const clock = (value: string | null | undefined) =>
    value
      ? new Intl.DateTimeFormat("en-GB", {
          timeZone: "America/Grenada",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(new Date(value))
      : null;
  return {
    user_id: row.user_id,
    employee_name: row.employee_name,
    personnel_status: row.personnel_status,
    arrival_time: clock(row.arrived_at),
    departure_time: clock(row.departed_at),
  };
}
