"use client";

import {
  type RosterGridPreview,
  type RosterRuleWarningsErrorPublic,
  useHrImportGrid,
  useHrListDepartmentMembers,
  useHrListDepartments,
  useHrValidateGrid,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@barrelsgd/ui/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { invalidateAfterRosterImport } from "@/lib/hr-invalidation";
import { rosterLabel } from "@/lib/people";
import { ruleWarningsFrom, warningCountText } from "./rule-codes";
import { RuleOverrideDialog } from "./rule-override-dialog";

const MONTH_RE = /^(\d{4})-(\d{2})$/;

// "YYYY-MM" -> the first and last calendar day of that month.
function monthBounds(month: string): { start: string; end: string } | null {
  const match = MONTH_RE.exec(month);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const mon = Number(match[2]);
  const lastDay = new Date(year, mon, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function ImportRosterDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [month, setMonth] = useState("");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [publish, setPublish] = useState(false);
  const [preview, setPreview] = useState<RosterGridPreview | null>(null);
  // Rule warnings from importing into a published roster, awaiting a reason.
  const [warnings, setWarnings] =
    useState<RosterRuleWarningsErrorPublic | null>(null);

  const departmentsQuery = useHrListDepartments();
  const departments = departmentsQuery.data?.data ?? [];
  const deptId = departmentId || departments[0]?.id || "";

  const membersQuery = useHrListDepartmentMembers(
    { path: { department_id: deptId } },
    { query: { enabled: Boolean(deptId) } }
  );
  const memberLabels = useMemo(
    () =>
      new Map(
        (membersQuery.data?.data ?? []).map((m) => [m.user_id, rosterLabel(m)])
      ),
    [membersQuery.data?.data]
  );

  const validateMutation = useHrValidateGrid();
  const importMutation = useHrImportGrid();

  const bounds = monthBounds(month);
  const ready = Boolean(deptId && bounds && csvText.trim());

  function reset() {
    setCsvText("");
    setFileName("");
    setPreview(null);
    setPublish(false);
  }

  function onFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setFileName(file.name);
    setPreview(null); // a new file invalidates the previous preview
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function check() {
    if (!(ready && bounds)) {
      return;
    }
    try {
      const result = await validateMutation.mutateAsync({
        body: {
          department_id: deptId,
          period_start: bounds.start,
          period_end: bounds.end,
          csv_text: csvText,
          file_name: fileName || "roster.csv",
        },
      });
      setPreview(result);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(`Could not read the roster: ${detail}`);
    }
  }

  /** Returns false when the import failed, so a typed override reason is kept. */
  async function runImport(reason?: string): Promise<boolean> {
    if (!(bounds && preview?.can_import)) {
      return false;
    }
    try {
      const result = await importMutation.mutateAsync({
        body: {
          department_id: deptId,
          period_start: bounds.start,
          period_end: bounds.end,
          csv_text: csvText,
          file_name: fileName || "roster.csv",
          publish,
          ...(reason ? { rule_override_reason: reason } : {}),
        },
      });
      setWarnings(null);
      await invalidateAfterRosterImport(queryClient, {
        departmentId: deptId,
        periodId: result.roster_period_id,
      });
      const held = result.rule_warning_count ?? 0;
      if (publish && !result.published && held > 0) {
        toast.warning(
          `Imported ${result.total_assignments} assignments as a draft. Not published: ${warningCountText(held)}. Review them and publish from the roster.`
        );
      } else {
        toast.success(
          `Imported ${result.total_assignments} assignments${result.published ? " (published)" : " as a draft"}`
        );
      }
      setOpen(false);
      return true;
    } catch (error) {
      const found = ruleWarningsFrom(error);
      if (found) {
        setWarnings(found);
        return false;
      }
      // Any other failure closes the dialog; the typed reason is kept.
      setWarnings(null);
      const detail =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(`Import failed: ${detail}`);
      return false;
    }
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          reset();
        }
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            <Upload data-icon="inline-start" />
            Import CSV
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import roster from CSV</DialogTitle>
          <DialogDescription>
            Upload a grid (names down the side, day numbers across the top).
            Names are matched to the department's staff. Imports as a draft you
            can review and publish.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="imp-dept">Department</FieldLabel>
              <NativeSelect
                id="imp-dept"
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  setPreview(null);
                }}
                value={deptId}
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="imp-month">Month</FieldLabel>
              <Input
                id="imp-month"
                onChange={(e) => {
                  setMonth(e.target.value);
                  setPreview(null);
                }}
                type="month"
                value={month}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="imp-file">CSV file</FieldLabel>
            <input
              accept=".csv,text/csv"
              className="text-sm"
              id="imp-file"
              onChange={(e) => onFile(e.target.files?.[0])}
              type="file"
            />
          </Field>

          {preview ? (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">
                {preview.matched_people}/{preview.total_people} people matched ·{" "}
                {preview.total_assignments} assignments
              </p>
              {preview.unmatched_names.length > 0 ? (
                <p className="mt-1 text-destructive">
                  Unmatched: {preview.unmatched_names.join(", ")}
                </p>
              ) : null}
              {preview.errors.length > 0 ? (
                <ul className="mt-1 list-disc pl-4 text-destructive">
                  {preview.errors.slice(0, 6).map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              ) : null}
              {preview.can_import ? (
                <p className="mt-1 text-muted-foreground">Ready to import.</p>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  Resolve the issues above, then re-check.
                </p>
              )}
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm" htmlFor="imp-pub">
            <Checkbox
              checked={publish}
              id="imp-pub"
              onCheckedChange={(v) => setPublish(!!v)}
            />
            Publish immediately after import
          </label>
        </FieldGroup>
        <DialogFooter>
          <Button
            onClick={() => setOpen(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={!ready || validateMutation.isPending}
            onClick={check}
            type="button"
            variant="secondary"
          >
            {validateMutation.isPending ? "Checking…" : "Check"}
          </Button>
          <Button
            disabled={!preview?.can_import || importMutation.isPending}
            onClick={() => runImport()}
            type="button"
          >
            {importMutation.isPending ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
        <RuleOverrideDialog
          busy={importMutation.isPending}
          labels={memberLabels}
          onCancel={() => setWarnings(null)}
          onConfirm={(reason) => runImport(reason)}
          warnings={warnings}
        />
      </DialogContent>
    </Dialog>
  );
}
