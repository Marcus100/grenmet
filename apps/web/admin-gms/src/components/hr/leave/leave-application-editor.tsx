"use client";

import {
  type LeaveType,
  readMyLeaveRequestsApiV1HrLeaveRequestsMeGetQueryKey,
  useCreateLeaveRequestApiV1HrLeaveRequestsPost,
  useReadHrProfileMeApiV1HrProfileMeGet,
} from "@grenmet/api-client";
import { Button } from "@grenmet/ui/components/ui/button";
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
import { RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { DatePicker } from "@/components/document/date-picker";
import { DocumentPreview } from "@/components/document/document-preview";
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

export function LeaveApplicationEditor() {
  const form = useForm({ defaultValues: EMPTY_LEAVE });
  const queryClient = useQueryClient();
  const profileQuery = useReadHrProfileMeApiV1HrProfileMeGet();
  const departmentId = profileQuery.data?.employment?.department?.id;
  const createMutation = useCreateLeaveRequestApiV1HrLeaveRequestsPost();

  async function submitToHr(values: typeof EMPTY_LEAVE) {
    if (!(values.startDate && values.endDate)) {
      toast.error("Start and end dates are required");
      return;
    }
    if (!departmentId) {
      toast.error("Your employment record has no department — contact HR");
      return;
    }
    try {
      await createMutation.mutateAsync({
        data: buildLeaveRequestPayload(values, departmentId),
      });
      await queryClient.invalidateQueries({
        queryKey: readMyLeaveRequestsApiV1HrLeaveRequestsMeGetQueryKey(),
      });
      toast.success("Leave request submitted");
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
              <h2 className="font-medium text-lg">Leave Application</h2>
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
              </FieldGroup>
            </form>
          </div>

          <DocumentPreview title="Leave Application">
            <LeaveDocument values={values} />
          </DocumentPreview>
        </div>
      )}
    </form.Subscribe>
  );
}
