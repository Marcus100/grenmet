"use client";

import {
  hrListMyShiftSwapsQueryKey,
  type ShiftSwapRequestPublic,
  useHrCreateShiftSwap,
  useHrGetHrProfileMe,
  useHrListAssignments,
  useHrListDepartmentMembers,
  useHrListMyShiftSwaps,
  useHrSubmitShiftSwap,
  useHrUpdateShiftSwap,
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
import { displayName } from "@/lib/people";
import { reportError } from "@/lib/report-error";
import { EMPTY_SHIFT } from "./shift-exchange-document";

/** Printable-paper fields plus the structured fields the HR API needs. */
const EMPTY_FORM = {
  ...EMPTY_SHIFT,
  counterpartUserId: "",
  sourceDate: "",
  sourceShiftCode: "",
  targetDate: "",
  targetShiftCode: "",
};

/** Map a saved swap request back onto the form fields when reopening a draft. */
function draftToFormValues(swap: ShiftSwapRequestPublic): typeof EMPTY_FORM {
  return {
    ...EMPTY_FORM,
    counterpartUserId: swap.counterpart_user_id,
    sourceDate: swap.source_date ?? "",
    sourceShiftCode: swap.source_shift_code ?? "",
    targetDate: swap.target_date ?? "",
    targetShiftCode: swap.target_shift_code ?? "",
    reason: swap.reason ?? "",
  };
}

export function ShiftExchangeEditor() {
  const form = useForm({ defaultValues: EMPTY_FORM });
  const queryClient = useQueryClient();
  const signature = useSigning();
  const sessionUser = useSessionUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftParam = searchParams.get("draft");
  const profileQuery = useHrGetHrProfileMe();
  const departmentId = profileQuery.data?.employment?.department?.id;
  const membersQuery = useHrListDepartmentMembers(
    { path: { department_id: departmentId ?? "" } },
    { query: { enabled: Boolean(departmentId) } }
  );
  const members = membersQuery.data?.data ?? [];
  const myRequestsQuery = useHrListMyShiftSwaps({});
  const createMutation = useHrCreateShiftSwap();
  const updateMutation = useHrUpdateShiftSwap();
  const submitMutation = useHrSubmitShiftSwap();
  const [submission, setSubmission] = useState<SubmissionMetadata | null>(null);
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
    if (!(rows && profileQuery.data && membersQuery.data)) {
      return;
    }
    const draft = rows.find((swap) => swap.id === draftParam);
    if (draft) {
      const counterpart = members.find(
        (member) => member.user_id === draft.counterpart_user_id
      );
      form.reset(
        {
          ...draftToFormValues(draft),
          requestingEmployee: sessionUser.full_name ?? "",
          department: profileQuery.data.employment?.department?.name ?? "",
          exchangeEmployee: counterpart ? displayName(counterpart) : "",
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
    profileQuery.data,
    membersQuery.data,
    members,
    sessionUser.full_name,
    form,
  ]);

  // Prefill blank fields with the current user, their department, and today.
  useEditorPrefill(
    (ctx) => {
      if (!form.getFieldValue("requestingEmployee")) {
        form.setFieldValue("requestingEmployee", ctx.fullName);
      }
      if (!form.getFieldValue("department")) {
        form.setFieldValue("department", ctx.department);
      }
      if (!form.getFieldValue("sourceDate")) {
        form.setFieldValue("sourceDate", ctx.today);
      }
    },
    { skip: Boolean(draftParam) }
  );

  function handleReset() {
    setSubmission(null);
    form.reset(
      {
        ...EMPTY_FORM,
        requestingEmployee: sessionUser.full_name ?? "",
        department: profileQuery.data?.employment?.department?.name ?? "",
        sourceDate: new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Grenada",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
      },
      { keepDefaultValues: true }
    );
    setCoApprovers([]);
    setStatusHint(null);
    setDraftId(null);
    loadedDraftRef.current = null;
    if (searchParams.get("draft")) {
      router.replace("/hr/shift");
    }
  }

  async function handleDownloadPdf() {
    try {
      await downloadHrPdf({
        payload: buildPayload(form.state.values, departmentId ?? ""),
        previewPath: "/api/v1/hr/shift-swaps/preview-pdf",
        signedDocumentId: submission?.signed_document_id,
        filename: "shift-exchange.pdf",
      });
    } catch (error) {
      reportError(error, "hr-exchange-pdf");
      toast.error(hrApiErrorMessage(error));
    }
  }

  async function refreshMyRequests() {
    await queryClient.invalidateQueries({
      queryKey: hrListMyShiftSwapsQueryKey({}),
    });
  }

  function buildPayload(values: typeof EMPTY_FORM, deptId: string) {
    return {
      counterpart_user_id: values.counterpartUserId,
      department_id: deptId,
      swap_type: "TEMPORARY" as const,
      source_date: values.sourceDate,
      source_shift_code: values.sourceShiftCode,
      target_date: values.targetDate,
      target_shift_code: values.targetShiftCode,
      reason: values.reason || undefined,
    };
  }

  async function persist(values: typeof EMPTY_FORM, asDraft: boolean) {
    if (!(asDraft || signature.data)) {
      toast.error("Save your signature in your profile before signing");
      return;
    }
    if (!asDraft) {
      if (!values.counterpartUserId) {
        toast.error("Select the department member to exchange with");
        return;
      }
      if (values.counterpartUserId === sessionUser.id) {
        toast.error("Select another employee for the exchange");
        return;
      }
      if (!(values.sourceDate && values.sourceShiftCode)) {
        toast.error("Date and shift requested for change are required");
        return;
      }
      if (!(values.targetDate && values.targetShiftCode)) {
        toast.error("Date and shift of the return shift are required");
        return;
      }
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
            path: { shift_swap_id: draftId },
            body: { ...buildPayload(values, departmentId), as_draft: true },
          });
          setStatusHint("Draft updated");
          toast.success("Draft updated");
        } else {
          const created = await createMutation.mutateAsync({
            body: {
              ...buildPayload(values, departmentId),
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
            path: { shift_swap_id: draftId },
            body: buildPayload(values, departmentId),
          });
          const submitted = await submitMutation.mutateAsync({
            path: { shift_swap_id: draftId },
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
              ...buildPayload(values, departmentId),
              as_draft: false,
              signature_version: signature.data?.version,
              co_approver_user_ids: coApprovers,
            },
          });
          setSubmission(submitted);
          await queryClient.invalidateQueries({ queryKey: signedDocumentsKey });
        }
        toast.success("Shift exchange request submitted");
        setStatusHint("Submitted copy — Reset to start a new form");
      }
      await refreshMyRequests();
    } catch (error) {
      reportError(error, "hr-exchange");
      const detail = hrApiErrorMessage(error);
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
              <p className="text-muted-foreground text-xs">
                The other employee must agree first. Supervisor review follows.
                The roster changes only after final approval.
              </p>
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
                          readOnly
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>

                  <form.Field name="requestingEmployee">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Employee Requesting Change
                        </FieldLabel>
                        <Input
                          id={field.name}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          readOnly
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>

                  <div className="grid gap-5 md:grid-cols-2">
                    <form.Field name="counterpartUserId">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Exchange With (Department Member)
                          </FieldLabel>
                          <NativeSelect
                            className="w-full"
                            disabled={!departmentId || members.length === 0}
                            id={field.name}
                            onChange={(e) => {
                              field.handleChange(e.target.value);
                              const member = members.find(
                                (m) => m.user_id === e.target.value
                              );
                              if (member) {
                                form.setFieldValue(
                                  "exchangeEmployee",
                                  displayName(member)
                                );
                              }
                            }}
                            value={field.state.value}
                          >
                            <NativeSelectOption value="">
                              Select member…
                            </NativeSelectOption>
                            {members
                              .filter(
                                (member) => member.user_id !== sessionUser.id
                              )
                              .map((member) => (
                                <NativeSelectOption
                                  key={member.user_id}
                                  value={member.user_id}
                                >
                                  {displayName(member)}
                                </NativeSelectOption>
                              ))}
                          </NativeSelect>
                        </Field>
                      )}
                    </form.Field>

                    <form.Field name="exchangeEmployee">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Employee With Whom Change Is Desired
                          </FieldLabel>
                          <Input
                            id={field.name}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            readOnly
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <form.Field name="sourceDate">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Date Requested for Change
                          </FieldLabel>
                          <DatePicker
                            id={field.name}
                            onChange={(date) => {
                              field.handleChange(date);
                              form.setFieldValue("sourceShiftCode", "");
                            }}
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>

                    <form.Field name="sourceShiftCode">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Shift Requested for Change
                          </FieldLabel>
                          <Input
                            id={field.name}
                            onChange={(e) => field.handleChange(e.target.value)}
                            placeholder="e.g. M"
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <form.Field name="targetDate">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Date of Return Shift
                          </FieldLabel>
                          <DatePicker
                            id={field.name}
                            onChange={field.handleChange}
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>

                    <form.Field name="targetShiftCode">
                      {(field) => (
                        <Field className="gap-1">
                          <FieldLabel className="text-xs" htmlFor={field.name}>
                            Return Shift
                          </FieldLabel>
                          <Input
                            id={field.name}
                            onChange={(e) => field.handleChange(e.target.value)}
                            placeholder="e.g. E"
                            value={field.state.value}
                          />
                        </Field>
                      )}
                    </form.Field>
                  </div>

                  <form.Field name="reason">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Reason(s) for Request
                        </FieldLabel>
                        <Textarea
                          id={field.name}
                          maxLength={1000}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>

                  <Field className="gap-1">
                    <FieldLabel className="text-xs">
                      Additional co-approvers (the exchange employee is always
                      required)
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

          <ExchangeShiftPrefill
            date={values.sourceDate}
            onPrefill={(code) => form.setFieldValue("sourceShiftCode", code)}
            selected={values.sourceShiftCode}
          />
          <HrPdfPreview
            payload={buildPayload(values, departmentId ?? "")}
            previewPath="/api/v1/hr/shift-swaps/preview-pdf"
            ready={Boolean(
              departmentId &&
                values.counterpartUserId &&
                values.sourceDate &&
                values.targetDate &&
                values.sourceShiftCode &&
                values.targetShiftCode
            )}
            signedDocumentId={submission?.signed_document_id}
            title="Shift Exchange Requisition"
          />
        </div>
      )}
    </form.Subscribe>
  );
}

function ExchangeShiftPrefill({
  date,
  selected,
  onPrefill,
}: {
  date: string;
  selected: string;
  onPrefill: (code: string) => void;
}) {
  const query = useHrListAssignments(
    { query: { scope: "me", start: date, end: date } },
    { query: { enabled: Boolean(date) } }
  );
  useEffect(() => {
    const entries =
      query.data?.data.filter(
        (entry) => entry.category === "WORK" && !entry.is_draft
      ) ?? [];
    if (!selected && entries.length === 1) onPrefill(entries[0].shift_code);
  }, [query.data, selected, onPrefill]);
  return null;
}
