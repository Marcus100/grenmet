"use client";

import {
  listMyShiftSwapsApiV1HrShiftSwapsMeGetQueryKey,
  useCreateShiftSwapApiV1HrShiftSwapsPost,
  useListDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGet,
  useReadHrProfileMeApiV1HrProfileMeGet,
} from "@grenmet/api-client";
import { Button } from "@grenmet/ui/components/ui/button";
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
import { RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { DatePicker } from "@/components/document/date-picker";
import { DocumentPreview } from "@/components/document/document-preview";
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

export function ShiftExchangeEditor() {
  const form = useForm({ defaultValues: EMPTY_FORM });
  const queryClient = useQueryClient();
  const profileQuery = useReadHrProfileMeApiV1HrProfileMeGet();
  const departmentId = profileQuery.data?.employment?.department?.id;
  const membersQuery =
    useListDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGet(
      departmentId ?? "",
      { query: { enabled: Boolean(departmentId) } }
    );
  const members = membersQuery.data?.data ?? [];
  const createMutation = useCreateShiftSwapApiV1HrShiftSwapsPost();

  async function submitToHr(values: typeof EMPTY_FORM) {
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
    if (!departmentId) {
      toast.error("Your employment record has no department — contact HR");
      return;
    }
    try {
      await createMutation.mutateAsync({
        data: {
          counterpart_user_id: values.counterpartUserId,
          department_id: departmentId,
          swap_type: "TEMPORARY",
          source_date: values.sourceDate,
          source_shift_code: values.sourceShiftCode,
          target_date: values.targetDate,
          target_shift_code: values.targetShiftCode,
          reason: values.reason || undefined,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: listMyShiftSwapsApiV1HrShiftSwapsMeGetQueryKey(),
      });
      toast.success("Shift exchange request submitted");
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
              <h2 className="font-medium text-lg">
                Shift Exchange Requisition
              </h2>
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
              </FieldGroup>
            </form>
          </div>

          <DocumentPreview title="Shift Exchange Requisition">
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
