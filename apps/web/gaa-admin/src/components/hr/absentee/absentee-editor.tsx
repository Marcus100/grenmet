"use client";

import {
  type AbsenceReason,
  type AbsenteeReportCreate,
  type AbsenteeReportPublic,
  hrGetAbsenteeReportsQueryKey,
  useHrCreateAbsenteeReport,
  useHrGetAbsenteeReports,
  useHrGetHrProfileMe,
  useHrListAssignments,
  useHrListDepartmentMembers,
  useHrSubmitAbsenteeReport,
  useHrUpdateAbsenteeReport,
} from "@barrelsgd/api-client";
import { useSessionUser } from "@barrelsgd/auth";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barrelsgd/ui/components/ui/select";
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
import {
  SubmissionDate,
  type SubmissionMetadata,
} from "@/components/hr/submission-date";
import { useEditorPrefill } from "@/components/hr/use-editor-prefill";
import { reportError } from "@/lib/report-error";
import { ABSENTEE_REASONS, EMPTY_ABSENTEE } from "./absentee-document";

/** Paper-form checklist labels → API AbsenceReason values. */
const ABSENCE_REASON_MAP: Record<string, AbsenceReason> = {
  "Uncertified Sick": "UNCERTIFIED_SICK",
  "Illness on the Job": "ILLNESS_ON_JOB",
  "Illness (family member)": "ILLNESS_FAMILY_MEMBER",
  "Time Off": "TIME_OFF",
  Other: "OTHER",
};

/** API AbsenceReason → a representative paper-form label (for reopening a draft). */
const REVERSE_ABSENCE_REASON: Partial<Record<AbsenceReason, string>> = {
  UNCERTIFIED_SICK: "Uncertified Sick",
  ILLNESS_ON_JOB: "Illness on the Job",
  ILLNESS_FAMILY_MEMBER: "Illness (family member)",
  TIME_OFF: "Time Off",
  OTHER: "Other",
};

export function buildAbsenteeReportPayload(
  values: typeof EMPTY_ABSENTEE,
  userId: string,
  departmentId: string
): AbsenteeReportCreate {
  return {
    user_id: userId,
    department_id: departmentId,
    report_date: values.date,
    reason: ABSENCE_REASON_MAP[values.reason] ?? ("OTHER" as AbsenceReason),
    notes: values.notes || undefined,
    expected_shift_code: values.expectedShiftCode || undefined,
    absence_start_time: values.absenceStartTime || undefined,
    absence_end_time: values.absenceEndTime || undefined,
  };
}

/** Map a saved report back onto the paper-form fields when reopening a draft. */
function draftToFormValues(
  report: AbsenteeReportPublic
): typeof EMPTY_ABSENTEE {
  return {
    ...EMPTY_ABSENTEE,
    date: report.report_date ?? "",
    reason: REVERSE_ABSENCE_REASON[report.reason] ?? "Uncertified Sick",
    notes: report.notes ?? "",
    employeeId: report.user_id,
    expectedShiftCode: report.expected_shift_code ?? "",
    absenceStartTime: report.absence_start_time ?? "",
    absenceEndTime: report.absence_end_time ?? "",
  };
}

export function AbsenteeEditor() {
  const form = useForm({ defaultValues: EMPTY_ABSENTEE });
  const queryClient = useQueryClient();
  const signature = useSigning();
  const sessionUser = useSessionUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftParam = searchParams.get("draft");
  const profileQuery = useHrGetHrProfileMe();
  const userId = profileQuery.data?.id;
  const departmentId = profileQuery.data?.employment?.department?.id;
  const membersQuery = useHrListDepartmentMembers(
    { path: { department_id: departmentId ?? "" } },
    { query: { enabled: Boolean(departmentId) } }
  );
  const myReportsQuery = useHrGetAbsenteeReports({});
  const createMutation = useHrCreateAbsenteeReport();
  const updateMutation = useHrUpdateAbsenteeReport();
  const submitMutation = useHrSubmitAbsenteeReport();
  const [submission, setSubmission] = useState<SubmissionMetadata | null>(null);
  const [coApprovers, setCoApprovers] = useState<string[]>([]);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
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
    const rows = myReportsQuery.data?.data;
    if (!rows) {
      return;
    }
    const draft = rows.find((report) => report.id === draftParam);
    if (
      draft &&
      profileQuery.data &&
      (draft.user_id === userId || !membersQuery.isFetching)
    ) {
      const subject = membersQuery.data?.data.find(
        (member) => member.user_id === draft.user_id
      );
      form.reset(
        {
          ...draftToFormValues(draft),
          employeeName:
            draft.user_id === userId
              ? (sessionUser.full_name ?? "")
              : (subject?.full_name ?? draft.user_id),
          department: profileQuery.data.employment?.department?.name ?? "",
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
  }, [
    draftParam,
    myReportsQuery.data,
    form,
    profileQuery.data,
    membersQuery.data,
    membersQuery.isFetching,
    userId,
    sessionUser.full_name,
  ]);

  // Prefill blank fields with the current user, their department, and today.
  useEditorPrefill(
    (ctx) => {
      if (!form.getFieldValue("employeeName")) {
        form.setFieldValue("employeeName", ctx.fullName);
      }
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
    setValidationError(null);
    setDraftId(null);
    loadedDraftRef.current = null;
    if (searchParams.get("draft")) {
      router.replace("/hr/absentee");
    }
  }

  async function handleDownloadPdf() {
    try {
      const values = form.state.values;
      await downloadHrPdf({
        payload: buildAbsenteeReportPayload(
          values,
          values.employeeId || userId || "",
          departmentId ?? ""
        ),
        previewPath: "/api/v1/hr/absentee-reports/preview-pdf",
        signedDocumentId: submission?.signed_document_id,
        filename: "absentee-report.pdf",
      });
    } catch (error) {
      reportError(error, "hr-absentee-pdf-download");
      toast.error(hrApiErrorMessage(error));
    }
  }

  async function refreshMyReports() {
    await queryClient.invalidateQueries({
      queryKey: hrGetAbsenteeReportsQueryKey({}),
    });
  }

  async function persist(values: typeof EMPTY_ABSENTEE, asDraft: boolean) {
    setValidationError(null);
    let error: string | null = null;
    if (!values.date) error = "Date of absence is required";
    else if (!ABSENCE_REASON_MAP[values.reason])
      error = "Choose a reason for the absence";
    else if (
      !asDraft &&
      ["Uncertified Sick", "Illness on the Job"].includes(values.reason) &&
      !values.notes.trim()
    )
      error = "Provide details for uncertified sick or illness on the job";
    else if (
      Boolean(values.absenceStartTime) !== Boolean(values.absenceEndTime)
    )
      error = "Enter both absence times or leave both blank for the full shift";
    if (error) {
      setValidationError(error);
      toast.error(error);
      return;
    }
    if (!(asDraft || signature.data)) {
      toast.error("Save your signature in your profile before signing");
      return;
    }
    if (!(asDraft || values.date)) {
      toast.error("Date of absence is required");
      return;
    }
    if (!(userId && departmentId)) {
      toast.error("Your employment record has no department — contact HR");
      return;
    }
    setPendingAction(asDraft ? "save" : "submit");
    const subjectId = values.employeeId || userId;
    try {
      if (asDraft) {
        if (draftId) {
          await updateMutation.mutateAsync({
            path: { absentee_report_id: draftId },
            body: {
              ...buildAbsenteeReportPayload(values, subjectId, departmentId),
              as_draft: true,
            },
          });
          setStatusHint("Draft updated");
          toast.success("Draft updated");
        } else {
          const created = await createMutation.mutateAsync({
            body: {
              ...buildAbsenteeReportPayload(values, subjectId, departmentId),
              as_draft: true,
              co_approver_user_ids: [],
            },
          });
          setDraftId(created.id);
          loadedDraftRef.current = created.id;
          setStatusHint("Draft saved");
          toast.success("Draft saved");
        }
      } else {
        if (draftId) {
          await updateMutation.mutateAsync({
            path: { absentee_report_id: draftId },
            body: buildAbsenteeReportPayload(values, subjectId, departmentId),
          });
          const submitted = await submitMutation.mutateAsync({
            path: { absentee_report_id: draftId },
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
              ...buildAbsenteeReportPayload(values, subjectId, departmentId),
              as_draft: false,
              signature_version: signature.data?.version,
              co_approver_user_ids: coApprovers,
            },
          });
          setSubmission(submitted);
          await queryClient.invalidateQueries({ queryKey: signedDocumentsKey });
        }
        toast.success("Absentee report submitted");
        setStatusHint("Submitted copy — Reset to start a new form");
      }
      await refreshMyReports();
    } catch (error) {
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
              <SubmissionDate submission={submission} />
              <p className="text-muted-foreground text-xs">
                Reported by {sessionUser.full_name}. Submit for supervisor
                review.
              </p>
              <FormActionBar
                isSaving={pendingAction === "save"}
                isSubmitting={pendingAction === "submit"}
                onDownloadPdf={handleDownloadPdf}
                onReset={handleReset}
                onSave={submission ? undefined : () => persist(values, true)}
                onSubmit={submission ? undefined : () => persist(values, false)}
                statusHint={statusHint}
                submitDisabled={!(userId && departmentId)}
                submitLabel="Sign & submit"
              />
            </div>

            <Separator />
            {validationError && (
              <p className="text-destructive text-sm" role="alert">
                {validationError}
              </p>
            )}

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
                  <form.Field name="employeeName">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Employee Name
                        </FieldLabel>
                        <NativeSelect
                          id={field.name}
                          onChange={(e) => {
                            const id = e.target.value;
                            form.setFieldValue("employeeId", id);
                            field.handleChange(
                              id === userId
                                ? (sessionUser.full_name ?? "")
                                : (membersQuery.data?.data.find(
                                    (member) => member.user_id === id
                                  )?.full_name ?? "")
                            );
                            form.setFieldValue("expectedShiftCode", "");
                            form.setFieldValue("absenceStartTime", "");
                            form.setFieldValue("absenceEndTime", "");
                          }}
                          value={values.employeeId || userId || ""}
                        >
                          <NativeSelectOption value={userId ?? ""}>
                            {sessionUser.full_name || "Current employee"}
                          </NativeSelectOption>
                          {membersQuery.data?.data
                            .filter((member) => member.user_id !== userId)
                            .map((member) => (
                              <NativeSelectOption
                                key={member.user_id}
                                value={member.user_id}
                              >
                                {member.full_name}
                              </NativeSelectOption>
                            ))}
                        </NativeSelect>
                        <p className="text-muted-foreground text-xs">
                          Reporting another employee requires scoped supervisor
                          access.
                        </p>
                      </Field>
                    )}
                  </form.Field>

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
                            onChange={(value) => {
                              field.handleChange(value);
                              form.setFieldValue("expectedShiftCode", "");
                              form.setFieldValue("absenceStartTime", "");
                              form.setFieldValue("absenceEndTime", "");
                            }}
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>
                  </div>

                  <AbsenteeShiftPrefill
                    date={values.date}
                    departmentId={departmentId}
                    expectedShiftCode={values.expectedShiftCode}
                    onPrefill={(code) =>
                      form.setFieldValue("expectedShiftCode", code)
                    }
                    ownUserId={userId}
                    subjectId={values.employeeId || userId}
                  />
                  <div className="grid gap-4 md:grid-cols-3">
                    <form.Field name="expectedShiftCode">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Expected shift
                          </FieldLabel>
                          <Input
                            id={field.name}
                            maxLength={10}
                            onChange={(e) => field.handleChange(e.target.value)}
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>
                    <form.Field name="absenceStartTime">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Absence from
                          </FieldLabel>
                          <Input
                            id={field.name}
                            onChange={(e) => field.handleChange(e.target.value)}
                            type="time"
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>
                    <form.Field name="absenceEndTime">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Absence to
                          </FieldLabel>
                          <Input
                            id={field.name}
                            onChange={(e) => field.handleChange(e.target.value)}
                            type="time"
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Leave both times blank for the full shift. Overnight times
                    belong to the date the shift starts.
                  </p>

                  <form.Field name="reason">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Reason
                        </FieldLabel>
                        <Select
                          onValueChange={(v) => field.handleChange(v ?? "")}
                          value={field.state.value}
                        >
                          <SelectTrigger id={field.name}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ABSENTEE_REASONS.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  </form.Field>

                  <form.Field name="notes">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Reason(s) — details
                        </FieldLabel>
                        <Textarea
                          id={field.name}
                          maxLength={1000}
                          onChange={(e) => field.handleChange(e.target.value)}
                          rows={4}
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>

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
            payload={buildAbsenteeReportPayload(
              values,
              values.employeeId || userId || "",
              departmentId ?? ""
            )}
            previewPath="/api/v1/hr/absentee-reports/preview-pdf"
            ready={Boolean(userId && departmentId && values.date)}
            signedDocumentId={submission?.signed_document_id}
            title="Absentee Report"
          />
        </div>
      )}
    </form.Subscribe>
  );
}

function AbsenteeShiftPrefill({
  date,
  departmentId,
  ownUserId,
  subjectId,
  expectedShiftCode,
  onPrefill,
}: {
  date: string;
  departmentId?: string;
  ownUserId?: string;
  subjectId?: string;
  expectedShiftCode: string;
  onPrefill: (code: string) => void;
}) {
  const roster = useHrListAssignments(
    {
      query: {
        start: date,
        end: date,
        department_id: departmentId,
        scope: "me",
      },
    },
    {
      query: { enabled: Boolean(date && ownUserId && subjectId === ownUserId) },
    }
  );
  const codes = roster.data?.data
    .filter((row) => !row.is_draft && row.category === "WORK")
    .map((row) => row.shift_code);
  const code = codes?.length === 1 ? codes[0] : undefined;
  useEffect(() => {
    if (code && !expectedShiftCode) onPrefill(code);
  }, [code, expectedShiftCode, onPrefill]);
  return null;
}
