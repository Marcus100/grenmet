"use client";

import {
  listMyShiftSwapsApiV1HrShiftSwapsMeGetQueryKey,
  type ShiftSwapRequestPublic,
  useCreateShiftSwapApiV1HrShiftSwapsPost,
  useListDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGet,
  useListMyShiftSwapsApiV1HrShiftSwapsMeGet,
  useReadHrProfileMeApiV1HrProfileMeGet,
  useSubmitShiftSwapApiV1HrShiftSwapsShiftSwapIdSubmitPost,
  useUpdateShiftSwapApiV1HrShiftSwapsShiftSwapIdPatch,
} from "@grenmet/api-client";
import { useSessionUser } from "@grenmet/auth";
import { Field, FieldGroup, FieldLabel } from "@grenmet/ui/components/ui/field";
import { Input } from "@grenmet/ui/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@grenmet/ui/components/ui/native-select";
import { Separator } from "@grenmet/ui/components/ui/separator";
import { Textarea } from "@grenmet/ui/components/ui/textarea";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DatePicker } from "@/components/document/date-picker";
import { DocumentPreview } from "@/components/document/document-preview";
import { CoApproverPicker } from "@/components/hr/co-approver-picker";
import { FormActionBar } from "@/components/hr/form-action-bar";
import { useEditorPrefill } from "@/components/hr/use-editor-prefill";
import { EMPTY_SHIFT, ShiftExchangeDocument } from "./shift-exchange-document";

/** Printable-paper fields plus the structured fields the HR API needs. */
const EMPTY_FORM = {
  ...EMPTY_SHIFT,
  counterpartUserId: "",
  sourceDate: "",
  sourceShiftCode: "",
  targetDate: "",
  targetShiftCode: "",
};

function memberLabel(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}. ${lastName}`;
}

function formatDateShift(date: string, shiftCode: string) {
  return [date, shiftCode && `Shift ${shiftCode}`].filter(Boolean).join(" — ");
}

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
  const sessionUser = useSessionUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftParam = searchParams.get("draft");
  const profileQuery = useReadHrProfileMeApiV1HrProfileMeGet();
  const departmentId = profileQuery.data?.employment?.department?.id;
  const membersQuery =
    useListDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGet(
      departmentId ?? "",
      { query: { enabled: Boolean(departmentId) } }
    );
  const members = membersQuery.data?.data ?? [];
  const myRequestsQuery = useListMyShiftSwapsApiV1HrShiftSwapsMeGet();
  const createMutation = useCreateShiftSwapApiV1HrShiftSwapsPost();
  const updateMutation = useUpdateShiftSwapApiV1HrShiftSwapsShiftSwapIdPatch();
  const submitMutation =
    useSubmitShiftSwapApiV1HrShiftSwapsShiftSwapIdSubmitPost();
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
    const draft = rows.find((swap) => swap.id === draftParam);
    if (draft) {
      form.reset(draftToFormValues(draft));
      setDraftId(draftParam);
      setStatusHint("Editing saved draft");
      loadedDraftRef.current = draftParam;
    }
  }, [draftParam, myRequestsQuery.data, form]);

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
    form.reset();
    setCoApprovers([]);
    setStatusHint(null);
    setDraftId(null);
    loadedDraftRef.current = null;
    if (searchParams.get("draft")) {
      router.replace("/hr/shift");
    }
  }

  function handleDownloadPdf() {
    window.print();
  }

  async function refreshMyRequests() {
    await queryClient.invalidateQueries({
      queryKey: listMyShiftSwapsApiV1HrShiftSwapsMeGetQueryKey(),
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
    if (!asDraft) {
      if (!values.counterpartUserId) {
        toast.error("Select the department member to exchange with");
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
            shift_swap_id: draftId,
            data: buildPayload(values, departmentId),
          });
          setStatusHint("Draft updated");
          toast.success("Draft updated");
        } else {
          const created = await createMutation.mutateAsync({
            data: {
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
          await submitMutation.mutateAsync({
            shift_swap_id: draftId,
            data: { co_approver_user_ids: coApprovers },
          });
        } else {
          await createMutation.mutateAsync({
            data: {
              ...buildPayload(values, departmentId),
              as_draft: false,
              co_approver_user_ids: coApprovers,
            },
          });
        }
        toast.success("Shift exchange request submitted");
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
                                memberLabel(member.first_name, member.last_name)
                              );
                            }
                          }}
                          value={field.state.value}
                        >
                          <NativeSelectOption value="">
                            Select member…
                          </NativeSelectOption>
                          {members.map((member) => (
                            <NativeSelectOption
                              key={member.user_id}
                              value={member.user_id}
                            >
                              {memberLabel(member.first_name, member.last_name)}
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
                          onChange={field.handleChange}
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
                        onChange={(e) => field.handleChange(e.target.value)}
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
          </div>

          <DocumentPreview
            showDownloadPdf={false}
            title="Shift Exchange Requisition"
          >
            <ShiftExchangeDocument
              values={{
                ...values,
                dateShiftRequested: formatDateShift(
                  values.sourceDate,
                  values.sourceShiftCode
                ),
                dateReturnShift: formatDateShift(
                  values.targetDate,
                  values.targetShiftCode
                ),
              }}
            />
          </DocumentPreview>
        </div>
      )}
    </form.Subscribe>
  );
}
