"use client";

import {
  readStatusReportsApiV1HrStatusReportsGetQueryKey,
  type ShiftPeriod,
  type StatusReportCreate,
  type StatusReportPublic,
  useCreateStatusReportApiV1HrStatusReportsPost,
  useReadHrProfileMeApiV1HrProfileMeGet,
  useReadStatusReportsApiV1HrStatusReportsGet,
  useSubmitStatusReportApiV1HrStatusReportsReportIdSubmitPost,
  useUpdateStatusReportApiV1HrStatusReportsReportIdPatch,
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
import {
  DailyStatusDocument,
  type DailyStatusValues,
  EMPTY_DAILY_STATUS,
  SHIFT_OPTIONS,
  YES_NO,
} from "./daily-status-document";

/** Paper-form shift labels → API ShiftPeriod values. */
const SHIFT_PERIOD_MAP: Record<string, ShiftPeriod> = {
  "A.M.": "AM",
  "P.M.": "PM",
};

/** API ShiftPeriod → paper-form shift label (for reopening a draft). */
const REVERSE_SHIFT_PERIOD: Partial<Record<ShiftPeriod, string>> = {
  AM: "A.M.",
  PM: "P.M.",
};

export function buildStatusReportPayload(
  values: DailyStatusValues,
  departmentId: string
): StatusReportCreate {
  const shiftPeriod = SHIFT_PERIOD_MAP[values.shift] ?? "AM";
  return {
    department_id: departmentId,
    report_date: values.date,
    shift_code: shiftPeriod,
    shift_period: shiftPeriod,
    all_personnel_reported_on_time: values.allReported === "Yes",
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
function draftToFormValues(report: StatusReportPublic): DailyStatusValues {
  const shiftLabel = report.shift_period
    ? REVERSE_SHIFT_PERIOD[report.shift_period]
    : undefined;
  return {
    ...EMPTY_DAILY_STATUS,
    date: report.report_date ?? "",
    shift: shiftLabel ?? "A.M.",
    absenteeism: report.personnel_summary ?? "",
    allReported: report.all_personnel_reported_on_time === false ? "No" : "Yes",
    notReportedExplain: report.personnel_explanation ?? "",
    affectedEfficiency: report.affected_operations ? "Yes" : "No",
    affectedExplain: report.affected_operations_explanation ?? "",
    comments: report.general_remarks ?? "",
  };
}

export function DailyStatusEditor() {
  const form = useForm({ defaultValues: EMPTY_DAILY_STATUS });
  const queryClient = useQueryClient();
  const sessionUser = useSessionUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftParam = searchParams.get("draft");
  const profileQuery = useReadHrProfileMeApiV1HrProfileMeGet();
  const departmentId = profileQuery.data?.employment?.department?.id;
  const myReportsQuery = useReadStatusReportsApiV1HrStatusReportsGet();
  const createMutation = useCreateStatusReportApiV1HrStatusReportsPost();
  const updateMutation =
    useUpdateStatusReportApiV1HrStatusReportsReportIdPatch();
  const submitMutation =
    useSubmitStatusReportApiV1HrStatusReportsReportIdSubmitPost();
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
    const rows = myReportsQuery.data?.data;
    if (!rows) {
      return;
    }
    const draft = rows.find((report) => report.id === draftParam);
    if (draft) {
      form.reset(draftToFormValues(draft));
      setDraftId(draftParam);
      setStatusHint("Editing saved draft");
      loadedDraftRef.current = draftParam;
    }
  }, [draftParam, myReportsQuery.data, form]);

  function handleReset() {
    form.reset();
    setCoApprovers([]);
    setStatusHint(null);
    setDraftId(null);
    loadedDraftRef.current = null;
    if (searchParams.get("draft")) {
      router.replace("/hr/status");
    }
  }

  function handleDownloadPdf() {
    window.print();
  }

  async function refreshMyReports() {
    await queryClient.invalidateQueries({
      queryKey: readStatusReportsApiV1HrStatusReportsGetQueryKey(),
    });
  }

  async function persist(values: DailyStatusValues, asDraft: boolean) {
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
            report_id: draftId,
            data: buildStatusReportPayload(values, departmentId),
          });
          setStatusHint("Draft updated");
          toast.success("Draft updated");
        } else {
          const created = await createMutation.mutateAsync({
            data: {
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
          await submitMutation.mutateAsync({
            report_id: draftId,
            data: { co_approver_user_ids: coApprovers },
          });
        } else {
          await createMutation.mutateAsync({
            data: {
              ...buildStatusReportPayload(values, departmentId),
              as_draft: false,
              co_approver_user_ids: coApprovers,
            },
          });
        }
        toast.success("Status report submitted");
        handleReset();
      }
      await refreshMyReports();
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
                  <form.Field name="date">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Date
                        </FieldLabel>
                        <DatePicker
                          id={field.name}
                          onChange={field.handleChange}
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
                        <Select
                          onValueChange={(v) => field.handleChange(v ?? "")}
                          value={field.state.value}
                        >
                          <SelectTrigger id={field.name}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SHIFT_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                      <Select
                        onValueChange={(v) => field.handleChange(v ?? "")}
                        value={field.state.value}
                      >
                        <SelectTrigger id={field.name}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {YES_NO.map((v) => (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      <Select
                        onValueChange={(v) => field.handleChange(v ?? "")}
                        value={field.state.value}
                      >
                        <SelectTrigger id={field.name}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {YES_NO.map((v) => (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
            title="Daily Airport Status Report"
          >
            <DailyStatusDocument values={values} />
          </DocumentPreview>
        </div>
      )}
    </form.Subscribe>
  );
}
