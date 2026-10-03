"use client";

import {
  hrGetMyLeaveRequestsQueryKey,
  type LeaveRequestPublic,
  type LeaveType,
  type ProfAppointmentType,
  useHrCreateLeaveRequest,
  useHrGetHrProfileMe,
  useHrGetMyLeaveRequests,
  useHrSubmitLeaveRequest,
  useHrUpdateLeaveRequest,
} from "@barrelsgd/api-client";
import { useSessionUser } from "@barrelsgd/auth";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barrelsgd/ui/components/ui/select";
import { Separator } from "@barrelsgd/ui/components/ui/separator";
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
import { EMPTY_LEAVE, LEAVE_TYPES } from "./leave-document";

/** Paper-form labels → API LeaveType values. */
const LEAVE_TYPE_MAP: Record<string, LeaveType> = {
  "Annual Vacation": "VACATION",
  "Maternity Leave": "MATERNITY",
  "Professional Appointment": "PROFESSIONAL_APPOINTMENT",
  "Family Bereavement": "BEREAVEMENT",
  "Paternity Leave": "PATERNITY",
  Other: "OTHER",
};

const APPOINTMENT_SUBTYPES: ProfAppointmentType[] = [
  "BANK",
  "MEDICAL",
  "LEGAL",
  "DENTAL",
];

/** API LeaveType → a representative paper-form label (for reopening a draft). */
const REVERSE_LEAVE_TYPE: Partial<Record<LeaveType, string>> = {
  VACATION: "Annual Vacation",
  MATERNITY: "Maternity Leave",
  PROFESSIONAL_APPOINTMENT: "Professional Appointment",
  BEREAVEMENT: "Family Bereavement",
  PATERNITY: "Paternity Leave",
  OTHER: "Other",
};

export function buildLeaveRequestPayload(
  values: typeof EMPTY_LEAVE,
  departmentId: string
) {
  const subtype = APPOINTMENT_SUBTYPES.find(
    (item) => item === values.professionalAppointmentSubtype
  );
  return {
    department_id: departmentId,
    leave_type: LEAVE_TYPE_MAP[values.leaveType] ?? ("OTHER" as LeaveType),
    start_date: values.startDate,
    end_date: values.endDate,
    days_requested: values.daysRequested || undefined,
    reason:
      values.leaveType === "Other"
        ? values.otherReason.trim() || undefined
        : undefined,
    professional_appointment_subtype:
      values.leaveType === "Professional Appointment" ? subtype : undefined,
    salary_in_advance: values.salaryInAdvance,
    leave_address: values.leaveAddress.trim() || undefined,
    travel_from_date: values.travelFromDate || undefined,
    travel_to_date: values.travelToDate || undefined,
    requires_acting_appointment: values.requiresActingAppointment,
  };
}

export function validateLeaveValues(
  values: typeof EMPTY_LEAVE,
  asDraft: boolean
): string | null {
  if (!(values.startDate && values.endDate)) {
    return "Start and end dates are required";
  }
  if (!values.leaveType) {
    return "Choose a type of leave";
  }
  if (values.endDate < values.startDate) {
    return "End date must be on or after start date";
  }
  if (
    (values.daysRequested || !asDraft) &&
    (!Number.isFinite(Number(values.daysRequested)) ||
      Number(values.daysRequested) <= 0)
  ) {
    return "Enter a positive number of days requested";
  }
  if (!asDraft && values.leaveType === "Other" && !values.otherReason.trim()) {
    return "State the reason for other leave";
  }
  if (
    !asDraft &&
    values.leaveType === "Professional Appointment" &&
    !values.professionalAppointmentSubtype
  ) {
    return "Choose the professional appointment type";
  }
  if (Boolean(values.travelFromDate) !== Boolean(values.travelToDate)) {
    return "Enter both travel dates or leave both blank";
  }
  if (
    values.travelFromDate &&
    values.travelToDate &&
    values.travelToDate < values.travelFromDate
  ) {
    return "Travel to date must be on or after travel from date";
  }
  return null;
}

/** Map a saved request back onto the paper-form fields when reopening a draft. */
function draftToFormValues(request: LeaveRequestPublic): typeof EMPTY_LEAVE {
  return {
    ...EMPTY_LEAVE,
    daysRequested:
      request.days_requested == null ? "" : String(request.days_requested),
    leaveType: REVERSE_LEAVE_TYPE[request.leave_type] ?? "Other",
    startDate: request.start_date ?? "",
    endDate: request.end_date ?? "",
    otherReason: request.reason ?? "",
    professionalAppointmentSubtype:
      request.professional_appointment_subtype ?? "",
    salaryInAdvance: request.salary_in_advance ?? false,
    leaveAddress: request.leave_address ?? "",
    travelFromDate: request.travel_from_date ?? "",
    travelToDate: request.travel_to_date ?? "",
    requiresActingAppointment: request.requires_acting_appointment ?? false,
  };
}

export function LeaveApplicationEditor() {
  const form = useForm({ defaultValues: EMPTY_LEAVE });
  const queryClient = useQueryClient();
  const signature = useSigning();
  const sessionUser = useSessionUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftParam = searchParams.get("draft");
  const profileQuery = useHrGetHrProfileMe();
  const departmentId = profileQuery.data?.employment?.department?.id;
  const myRequestsQuery = useHrGetMyLeaveRequests({});
  const createMutation = useHrCreateLeaveRequest();
  const updateMutation = useHrUpdateLeaveRequest();
  const submitMutation = useHrSubmitLeaveRequest();
  const [submission, setSubmission] = useState<SubmissionMetadata | null>(null);
  const [coApprovers, setCoApprovers] = useState<string[]>([]);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(draftParam);
  const [pendingAction, setPendingAction] = useState<"save" | "submit" | null>(
    null
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const loadedDraftRef = useRef<string | null>(null);

  // When arriving via ?draft=<id>, load that draft into the form once.
  useEffect(() => {
    if (!draftParam || loadedDraftRef.current === draftParam) {
      return;
    }
    const rows = myRequestsQuery.data?.data;
    if (!rows || profileQuery.isFetching) {
      return;
    }
    const draft = rows.find((request) => request.id === draftParam);
    if (draft) {
      form.reset(
        {
          ...draftToFormValues(draft),
          employeeName: sessionUser.full_name ?? "",
          department:
            profileQuery.data?.employment?.department?.name ??
            draft.department_id,
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
    myRequestsQuery.data,
    profileQuery.isFetching,
    profileQuery.data,
    sessionUser.full_name,
    form,
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
      if (!form.getFieldValue("startDate")) {
        form.setFieldValue("startDate", ctx.today);
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
      router.replace("/hr/leave");
    }
  }

  async function handleDownloadPdf() {
    try {
      await downloadHrPdf({
        payload: buildLeaveRequestPayload(
          form.state.values,
          departmentId ?? ""
        ),
        previewPath: "/api/v1/hr/leave-requests/preview-pdf",
        signedDocumentId: submission?.signed_document_id,
        filename: "leave-application.pdf",
      });
    } catch (error) {
      reportError(error, "hr-leave-pdf-download");
      toast.error(hrApiErrorMessage(error));
    }
  }

  async function refreshMyRequests() {
    await queryClient.invalidateQueries({
      queryKey: hrGetMyLeaveRequestsQueryKey({}),
    });
  }

  async function persist(values: typeof EMPTY_LEAVE, asDraft: boolean) {
    setValidationError(null);
    if (!(asDraft || signature.data)) {
      const message = "Save your signature in your profile before signing";
      setValidationError(message);
      toast.error(message);
      return;
    }
    const invalid = validateLeaveValues(values, asDraft);
    if (invalid) {
      setValidationError(invalid);
      toast.error(invalid);
      return;
    }
    if (!departmentId) {
      const message = "Your employment record has no department — contact HR";
      setValidationError(message);
      toast.error(message);
      return;
    }
    setPendingAction(asDraft ? "save" : "submit");
    try {
      if (asDraft) {
        if (draftId) {
          await updateMutation.mutateAsync({
            path: { leave_request_id: draftId },
            body: buildLeaveRequestPayload(values, departmentId),
          });
          setStatusHint("Draft updated");
          toast.success("Draft updated");
        } else {
          const created = await createMutation.mutateAsync({
            body: {
              ...buildLeaveRequestPayload(values, departmentId),
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
            path: { leave_request_id: draftId },
            body: buildLeaveRequestPayload(values, departmentId),
          });
          const submitted = await submitMutation.mutateAsync({
            path: { leave_request_id: draftId },
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
              ...buildLeaveRequestPayload(values, departmentId),
              as_draft: false,
              signature_version: signature.data?.version,
              co_approver_user_ids: coApprovers,
            },
          });
          setSubmission(submitted);
          await queryClient.invalidateQueries({ queryKey: signedDocumentsKey });
        }
        toast.success("Leave request submitted");
        setStatusHint("Submitted copy — Reset to start a new form");
      }
      await refreshMyRequests();
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
            {profileQuery.data?.employment.details_complete === false && (
              <div
                className="rounded-lg border border-border bg-muted p-4 text-sm"
                role="status"
              >
                Before submitting leave, an administrator must verify your
                employee number, employment type, start date and opening leave
                balance. Complete these in HR Setup → Staff baseline.
              </div>
            )}
            <div className="flex flex-col gap-3">
              <SigningPanel submission={submission} />
              <SubmissionDate submission={submission} />
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
              {validationError ? (
                <p className="text-destructive text-sm" role="alert">
                  {validationError}
                </p>
              ) : null}
            </div>

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
                  <form.Field name="employeeName">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Employee Name
                        </FieldLabel>
                        <Input
                          id={field.name}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>

                  <form.Field name="department">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Department
                        </FieldLabel>
                        <Input
                          id={field.name}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>

                  <div className="grid gap-5 md:grid-cols-2">
                    <form.Field name="daysRequested">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Days Requested
                          </FieldLabel>
                          <Input
                            id={field.name}
                            min="0"
                            onChange={(e) => field.handleChange(e.target.value)}
                            step="any"
                            type="number"
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>

                    <form.Field name="leaveType">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Type of Leave
                          </FieldLabel>
                          <Select
                            onValueChange={(v) => field.handleChange(v ?? "")}
                            value={field.state.value}
                          >
                            <SelectTrigger id={field.name}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LEAVE_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
                    </form.Field>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <form.Field name="startDate">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Start Date
                          </FieldLabel>
                          <DatePicker
                            id={field.name}
                            onChange={field.handleChange}
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>

                    <form.Field name="endDate">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            End Date
                          </FieldLabel>
                          <DatePicker
                            id={field.name}
                            onChange={field.handleChange}
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>
                  </div>

                  {values.leaveType === "Other" ? (
                    <form.Field name="otherReason">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Other — please state reason
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

                  {values.leaveType === "Professional Appointment" ? (
                    <form.Field name="professionalAppointmentSubtype">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Appointment type
                          </FieldLabel>
                          <Select
                            onValueChange={(value) =>
                              field.handleChange(value ?? "")
                            }
                            value={field.state.value}
                          >
                            <SelectTrigger id={field.name}>
                              <SelectValue placeholder="Choose an appointment type" />
                            </SelectTrigger>
                            <SelectContent>
                              {APPOINTMENT_SUBTYPES.map((subtype) => (
                                <SelectItem key={subtype} value={subtype}>
                                  {subtype[0] + subtype.slice(1).toLowerCase()}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
                    </form.Field>
                  ) : null}

                  <form.Field name="salaryInAdvance">
                    {(field) => (
                      <label
                        className="flex items-center gap-2 text-sm"
                        htmlFor={field.name}
                      >
                        <Checkbox
                          checked={field.state.value}
                          id={field.name}
                          onCheckedChange={(checked) =>
                            field.handleChange(Boolean(checked))
                          }
                        />
                        Request salary in advance
                      </label>
                    )}
                  </form.Field>

                  <form.Field name="leaveAddress">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Where the leave will be spent
                        </FieldLabel>
                        <Input
                          id={field.name}
                          maxLength={500}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>

                  <div className="grid gap-5 md:grid-cols-2">
                    <form.Field name="travelFromDate">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Travel from (optional)
                          </FieldLabel>
                          <Input
                            id={field.name}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            type="date"
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>
                    <form.Field name="travelToDate">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Travel to (optional)
                          </FieldLabel>
                          <Input
                            id={field.name}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            type="date"
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>
                  </div>

                  <form.Field name="requiresActingAppointment">
                    {(field) => (
                      <label
                        className="flex items-center gap-2 text-sm"
                        htmlFor={field.name}
                      >
                        <Checkbox
                          checked={field.state.value}
                          id={field.name}
                          onCheckedChange={(checked) =>
                            field.handleChange(Boolean(checked))
                          }
                        />
                        An acting appointment will be required
                      </label>
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
            payload={buildLeaveRequestPayload(values, departmentId ?? "")}
            previewPath="/api/v1/hr/leave-requests/preview-pdf"
            ready={Boolean(
              departmentId &&
                values.leaveType &&
                values.startDate &&
                values.endDate
            )}
            signedDocumentId={submission?.signed_document_id}
            title="Leave Application"
          />
        </div>
      )}
    </form.Subscribe>
  );
}
