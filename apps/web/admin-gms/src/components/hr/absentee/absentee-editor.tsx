"use client";

import {
  type AbsenceReason,
  type AbsenteeReportCreate,
  type AbsenteeReportPublic,
  readAbsenteeReportsApiV1HrAbsenteeReportsGetQueryKey,
  useCreateAbsenteeReportApiV1HrAbsenteeReportsPost,
  useReadAbsenteeReportsApiV1HrAbsenteeReportsGet,
  useReadHrProfileMeApiV1HrProfileMeGet,
  useSubmitAbsenteeReportApiV1HrAbsenteeReportsAbsenteeReportIdSubmitPost,
  useUpdateAbsenteeReportApiV1HrAbsenteeReportsAbsenteeReportIdPatch,
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
  ABSENTEE_REASONS,
  AbsenteeDocument,
  EMPTY_ABSENTEE,
} from "./absentee-document";

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
  };
}

export function AbsenteeEditor() {
  const form = useForm({ defaultValues: EMPTY_ABSENTEE });
  const queryClient = useQueryClient();
  const sessionUser = useSessionUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftParam = searchParams.get("draft");
  const profileQuery = useReadHrProfileMeApiV1HrProfileMeGet();
  const userId = profileQuery.data?.id;
  const departmentId = profileQuery.data?.employment?.department?.id;
  const myReportsQuery = useReadAbsenteeReportsApiV1HrAbsenteeReportsGet();
  const createMutation = useCreateAbsenteeReportApiV1HrAbsenteeReportsPost();
  const updateMutation =
    useUpdateAbsenteeReportApiV1HrAbsenteeReportsAbsenteeReportIdPatch();
  const submitMutation =
    useSubmitAbsenteeReportApiV1HrAbsenteeReportsAbsenteeReportIdSubmitPost();
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
      router.replace("/hr/absentee");
    }
  }

  function handleDownloadPdf() {
    window.print();
  }

  async function refreshMyReports() {
    await queryClient.invalidateQueries({
      queryKey: readAbsenteeReportsApiV1HrAbsenteeReportsGetQueryKey(),
    });
  }

  async function persist(values: typeof EMPTY_ABSENTEE, asDraft: boolean) {
    if (!(asDraft || values.date)) {
      toast.error("Date of absence is required");
      return;
    }
    if (!(userId && departmentId)) {
      toast.error("Your employment record has no department — contact HR");
      return;
    }
    setPendingAction(asDraft ? "save" : "submit");
    try {
      if (asDraft) {
        if (draftId) {
          await updateMutation.mutateAsync({
            absentee_report_id: draftId,
            data: buildAbsenteeReportPayload(values, userId, departmentId),
          });
          setStatusHint("Draft updated");
          toast.success("Draft updated");
        } else {
          const created = await createMutation.mutateAsync({
            data: {
              ...buildAbsenteeReportPayload(values, userId, departmentId),
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
            absentee_report_id: draftId,
            data: { co_approver_user_ids: coApprovers },
          });
        } else {
          await createMutation.mutateAsync({
            data: {
              ...buildAbsenteeReportPayload(values, userId, departmentId),
              as_draft: false,
              co_approver_user_ids: coApprovers,
            },
          });
        }
        toast.success("Absentee report submitted");
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
                submitDisabled={!(userId && departmentId)}
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
                </div>

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

          <DocumentPreview showDownloadPdf={false} title="Absentee Report">
            <AbsenteeDocument values={values} />
          </DocumentPreview>
        </div>
      )}
    </form.Subscribe>
  );
}
