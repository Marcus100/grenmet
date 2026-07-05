"use client";

import {
  type LeaveRequestPublic,
  type LeaveType,
  readMyLeaveRequestsApiV1HrLeaveRequestsMeGetQueryKey,
  useCreateLeaveRequestApiV1HrLeaveRequestsPost,
  useReadHrProfileMeApiV1HrProfileMeGet,
  useReadMyLeaveRequestsApiV1HrLeaveRequestsMeGet,
  useSubmitLeaveRequestApiV1HrLeaveRequestsLeaveRequestIdSubmitPost,
  useUpdateLeaveRequestApiV1HrLeaveRequestsLeaveRequestIdPatch,
} from "@grenmet/api-client";
import { useSessionUser } from "@grenmet/auth";
import { Field, FieldGroup, FieldLabel } from "@grenmet/ui/components/ui/field";
import { Input } from "@grenmet/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@grenmet/ui/components/ui/select";
import { Separator } from "@grenmet/ui/components/ui/separator";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DatePicker } from "@/components/document/date-picker";
import { DocumentPreview } from "@/components/document/document-preview";
import { CoApproverPicker } from "@/components/hr/co-approver-picker";
import { FormActionBar } from "@/components/hr/form-action-bar";
import { EMPTY_LEAVE, LEAVE_TYPES, LeaveDocument } from "./leave-document";

/** Paper-form labels → API LeaveType values. */
const LEAVE_TYPE_MAP: Record<string, LeaveType> = {
  "Annual Vacation": "VACATION",
  "Maternity Leave": "MATERNITY",
  "Professional Appointment": "PROFESSIONAL_APPOINTMENT",
  "Family Bereavement": "BEREAVEMENT",
  "Paternity Leave": "PATERNITY",
  "Bank | Medical | Legal Dental": "PROFESSIONAL_APPOINTMENT",
  Other: "OTHER",
};

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
  return {
    department_id: departmentId,
    leave_type: LEAVE_TYPE_MAP[values.leaveType] ?? ("OTHER" as LeaveType),
    start_date: values.startDate,
    end_date: values.endDate,
    days_requested: values.daysRequested || undefined,
    reason: values.otherReason || undefined,
  };
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
  };
}

export function LeaveApplicationEditor() {
  const form = useForm({ defaultValues: EMPTY_LEAVE });
  const queryClient = useQueryClient();
  const sessionUser = useSessionUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftParam = searchParams.get("draft");
  const profileQuery = useReadHrProfileMeApiV1HrProfileMeGet();
  const departmentId = profileQuery.data?.employment?.department?.id;
  const myRequestsQuery = useReadMyLeaveRequestsApiV1HrLeaveRequestsMeGet();
  const createMutation = useCreateLeaveRequestApiV1HrLeaveRequestsPost();
  const updateMutation =
    useUpdateLeaveRequestApiV1HrLeaveRequestsLeaveRequestIdPatch();
  const submitMutation =
    useSubmitLeaveRequestApiV1HrLeaveRequestsLeaveRequestIdSubmitPost();
  const [coApprovers, setCoApprovers] = useState<string[]>([]);
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
    const rows = myRequestsQuery.data?.data;
    if (!rows) {
      return;
    }
    const draft = rows.find((request) => request.id === draftParam);
    if (draft) {
      form.reset(draftToFormValues(draft));
      setDraftId(draftParam);
      setStatusHint("Editing saved draft");
      loadedDraftRef.current = draftParam;
    }
  }, [draftParam, myRequestsQuery.data, form]);

  function handleReset() {
    form.reset();
    setCoApprovers([]);
    setStatusHint(null);
    setDraftId(null);
    loadedDraftRef.current = null;
    if (searchParams.get("draft")) {
      router.replace("/hr/leave");
    }
  }

  function handleDownloadPdf() {
    window.print();
  }

  async function refreshMyRequests() {
    await queryClient.invalidateQueries({
      queryKey: readMyLeaveRequestsApiV1HrLeaveRequestsMeGetQueryKey(),
    });
  }

  async function persist(values: typeof EMPTY_LEAVE, asDraft: boolean) {
    if (!(asDraft || (values.startDate && values.endDate))) {
      toast.error("Start and end dates are required");
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
            leave_request_id: draftId,
            data: buildLeaveRequestPayload(values, departmentId),
          });
          setStatusHint("Draft updated");
          toast.success("Draft updated");
        } else {
          const created = await createMutation.mutateAsync({
            data: {
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
          await submitMutation.mutateAsync({
            leave_request_id: draftId,
            data: { co_approver_user_ids: coApprovers },
          });
        } else {
          await createMutation.mutateAsync({
            data: {
              ...buildLeaveRequestPayload(values, departmentId),
              as_draft: false,
              co_approver_user_ids: coApprovers,
            },
          });
        }
        toast.success("Leave request submitted");
        handleReset();
      }
      await refreshMyRequests();
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(`${asDraft ? "Save" : "Submission"} failed: ${detail}`);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <form.Subscribe selector={(s) => s.values}>
      {(values) => (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
            <div className="flex flex-col gap-3">
              <FormActionBar
                isSaving={pendingAction === "save"}
                isSubmitting={pendingAction === "submit"}
                onDownloadPdf={handleDownloadPdf}
                onReset={handleReset}
                onSave={() => persist(values, true)}
                onSubmit={() => persist(values, false)}
                statusHint={statusHint}
                submitDisabled={!departmentId}
              />
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
                          onChange={(e) => field.handleChange(e.target.value)}
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
          </div>

          <DocumentPreview showDownloadPdf={false} title="Leave Application">
            <LeaveDocument values={values} />
          </DocumentPreview>
        </div>
      )}
    </form.Subscribe>
  );
}
