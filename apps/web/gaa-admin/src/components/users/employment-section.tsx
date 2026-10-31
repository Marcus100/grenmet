"use client";

import {
  authGetRoleAssignmentsQueryKey,
  type DepartmentPublic,
  type EmploymentRecordPublic,
  type EmploymentStatus,
  type EmploymentUpdate,
  type UserPublic,
  useHrCreateHrEmployment,
  useHrUpdateHrEmployment,
} from "@barrelsgd/api-client";
import { Alert, AlertDescription } from "@barrelsgd/ui/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@barrelsgd/ui/components/ui/alert-dialog";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { grenadaToday } from "@/components/hr/expiry";
import {
  DEPARTMENT_TRANSFER_WARNING,
  type EmploymentChangeReview,
  END_DATE_EXPLANATION,
  employmentSaveFailure,
  lastDayError,
  reviewEmploymentChange,
} from "@/lib/employment-end";
import { invalidateAfterEmploymentChange } from "@/lib/hr-invalidation";
import { reportError } from "@/lib/report-error";

interface EmploymentSectionProps {
  currentEmployment: EmploymentRecordPublic | undefined;
  departments: DepartmentPublic[];
  /** Employment or departments are still loading. */
  isFetching: boolean;
  open: boolean;
  user: UserPublic;
}

interface EmploymentDraft {
  department_id: string;
  employee_number: string;
  /** YYYY-MM-DD, or "" for no last day. */
  end_date: string;
  position: string;
  status: EmploymentStatus;
}

/**
 * What the server holds, as this form last loaded or saved it. Changes are judged
 * against this snapshot, never against the live query, so a refetch that brings
 * in someone else's edit cannot make an unrelated save look like a change.
 */
interface SavedEmployment {
  departmentId: string;
  employeeNumber: string | null;
  endDate: string | null;
  position: string | null;
  status: EmploymentStatus;
}

/** A text field as it is stored: trimmed, and null when blank. */
function orNull(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/** The record as this form compares it, or null when there is none yet. */
function snapshotOf(
  record: EmploymentRecordPublic | undefined
): SavedEmployment | null {
  return record
    ? {
        departmentId: record.department_id,
        employeeNumber: orNull(record.employee_number),
        endDate: record.end_date ?? null,
        position: orNull(record.position),
        status: record.status,
      }
    : null;
}

function sameSnapshot(a: SavedEmployment | null, b: SavedEmployment | null) {
  if (a === null || b === null) return a === b;
  return (
    a.departmentId === b.departmentId &&
    a.employeeNumber === b.employeeNumber &&
    a.endDate === b.endDate &&
    a.position === b.position &&
    a.status === b.status
  );
}

/**
 * True when, with the form loaded and nothing fetching, `latest` is a record
 * fetched after `compared` (the one the snapshot was set against) and it no
 * longer matches the snapshot.
 */
function changedSinceLoad({
  compared,
  fetching,
  latest,
  saved,
  seeded,
}: {
  compared: EmploymentRecordPublic | undefined;
  fetching: boolean;
  latest: EmploymentRecordPublic | undefined;
  saved: SavedEmployment | null;
  seeded: boolean;
}) {
  if (!seeded || fetching || latest === compared) return false;
  return !sameSnapshot(snapshotOf(latest), saved);
}

/**
 * Status select for an existing record. The create request has no status, so
 * before the record exists the form says it starts Active instead.
 */
function StatusField({
  editable,
  onChange,
  value,
}: {
  editable: boolean;
  onChange: (status: EmploymentStatus) => void;
  value: EmploymentStatus;
}) {
  if (!editable) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-medium text-sm">Status</span>
        <p className="text-muted-foreground text-sm">
          Active. A new record always starts Active.
        </p>
      </div>
    );
  }
  return (
    <Field>
      <FieldLabel htmlFor="mu-status">Status</FieldLabel>
      <NativeSelect
        id="mu-status"
        onChange={(e) => onChange(e.target.value as EmploymentStatus)}
        value={value}
      >
        <option value="ACTIVE">Active</option>
        <option value="INACTIVE">Inactive</option>
        <option value="TERMINATED">Terminated</option>
      </NativeSelect>
    </Field>
  );
}

/** Shown when the record changed on the server after this form loaded it. */
export const CHANGED_ELSEWHERE_NOTICE =
  "This record was changed after you opened it, perhaps by another administrator. The form still shows what you loaded; only the fields you edit are saved.";

/** Says the record changed elsewhere, with a way to reload it. Nothing when `show` is false. */
function ChangedElsewhereNotice({
  onLoadLatest,
  show,
}: {
  onLoadLatest: () => void;
  show: boolean;
}) {
  if (!show) return null;
  return (
    <Alert variant="warning">
      <AlertDescription>
        <span className="block">{CHANGED_ELSEWHERE_NOTICE}</span>
        <Button
          className="mt-2"
          onClick={onLoadLatest}
          size="sm"
          type="button"
          variant="outline"
        >
          Load latest values
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Department and employment record for one person, as HR administrators edit it
 * in the user dialog. Owns the draft form, the confirmation step before a change
 * that ends roles, and the plain-words result of a refused save.
 */
export function EmploymentSection({
  currentEmployment,
  departments,
  isFetching,
  open,
  user,
}: EmploymentSectionProps) {
  const queryClient = useQueryClient();
  const createEmploymentMutation = useHrCreateHrEmployment();
  const updateEmploymentMutation = useHrUpdateHrEmployment();
  const employmentBusy =
    createEmploymentMutation.isPending || updateEmploymentMutation.isPending;

  const [emp, setEmp] = useState<EmploymentDraft>({
    department_id: "",
    employee_number: "",
    position: "",
    status: "ACTIVE" as EmploymentStatus,
    end_date: "",
  });
  const [empSeeded, setEmpSeeded] = useState(false);
  // Null means no employment record yet (create mode).
  const [saved, setSaved] = useState<SavedEmployment | null>(null);
  // Set when a save needs the admin to confirm first (transfer, status that ends
  // roles, or a last day today or earlier). Cleared by any edit, so the
  // confirmation always matches the form.
  const [pendingReview, setPendingReview] =
    useState<EmploymentChangeReview | null>(null);
  // Plain-words reason the API refused the last save. Shown on the form.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Plain status message, such as "No changes to save". Not an error.
  const [notice, setNotice] = useState<string | null>(null);
  // The fetched record the snapshot was last set against (at load or save). Only
  // a record fetched after that can show a change made elsewhere; the stale
  // cached record right after this form's own save is not one.
  const [comparedRecord, setComparedRecord] = useState<
    EmploymentRecordPublic | undefined
  >(undefined);

  const today = grenadaToday();
  const draftEndDate = emp.end_date || null;
  const endDateProblem = saved
    ? lastDayError(emp.end_date, currentEmployment?.start_date)
    : null;
  const liveReview =
    saved === null
      ? null
      : reviewEmploymentChange({
          current: saved,
          next: {
            departmentId: emp.department_id,
            endDate: draftEndDate,
            status: emp.status,
          },
          today,
        });

  // A newly fetched record differs from the one this form loaded or saved
  // (another admin saved in between). Never judged mid-fetch.
  const changedElsewhere = changedSinceLoad({
    compared: comparedRecord,
    fetching: isFetching,
    latest: currentEmployment,
    saved,
    seeded: empSeeded,
  });

  // Seed the form once per open, after the read + departments settle.
  // No record (404) leaves the snapshot null → blank fields, "assign" (create) mode.
  useEffect(() => {
    if (!open) {
      setEmpSeeded(false);
      return;
    }
    if (empSeeded || isFetching) return;
    setEmp({
      department_id:
        currentEmployment?.department_id ?? departments[0]?.id ?? "",
      employee_number: currentEmployment?.employee_number ?? "",
      position: currentEmployment?.position ?? "",
      status: currentEmployment?.status ?? "ACTIVE",
      end_date: currentEmployment?.end_date ?? "",
    });
    setSaved(snapshotOf(currentEmployment));
    setComparedRecord(currentEmployment);
    setEmpSeeded(true);
  }, [open, empSeeded, isFetching, currentEmployment, departments]);

  function editEmployment(patch: Partial<EmploymentDraft>) {
    setEmp((s) => ({ ...s, ...patch }));
    setPendingReview(null);
    setSaveError(null);
    setNotice(null);
  }

  /**
   * Compares the draft with the snapshot field by field. Only fields that differ are
   * sent, so a stale form cannot move, deactivate, clear or overwrite anything another
   * admin changed after this form loaded. Returns the snapshot as it will stand once
   * the fields are saved.
   */
  function changesAgainst(base: SavedEmployment) {
    const employeeNumber = orNull(emp.employee_number);
    const position = orNull(emp.position);
    const changed = {
      department: emp.department_id !== base.departmentId,
      employeeNumber: employeeNumber !== base.employeeNumber,
      endDate: draftEndDate !== base.endDate,
      position: position !== base.position,
      status: emp.status !== base.status,
    };
    const fields: EmploymentUpdate = {
      ...(changed.employeeNumber ? { employee_number: employeeNumber } : {}),
      ...(changed.position ? { position } : {}),
      ...(changed.department ? { department_id: emp.department_id } : {}),
      ...(changed.status ? { status: emp.status } : {}),
      ...(changed.endDate ? { end_date: draftEndDate } : {}),
    };
    const next: SavedEmployment = {
      departmentId: changed.department ? emp.department_id : base.departmentId,
      employeeNumber: changed.employeeNumber
        ? employeeNumber
        : base.employeeNumber,
      endDate: changed.endDate ? draftEndDate : base.endDate,
      position: changed.position ? position : base.position,
      status: changed.status ? emp.status : base.status,
    };
    const hasChanges = Object.values(changed).some(Boolean);
    return { fields, hasChanges, next };
  }

  /** Runs one save request. On failure the plain reason goes on the form and this returns false. */
  async function attempt(request: () => Promise<unknown>): Promise<boolean> {
    try {
      await request();
      return true;
    } catch (error) {
      const failure = employmentSaveFailure(error);
      if (failure.unexpected) reportError(error, "hr-employment");
      setSaveError(failure.message);
      return false;
    }
  }

  /** Sends the fields that changed. Nothing is sent when nothing changed. */
  async function saveChanges(base: SavedEmployment) {
    const changes = changesAgainst(base);
    if (!changes.hasChanges) {
      setNotice("No changes to save");
      return;
    }
    const ok = await attempt(() =>
      updateEmploymentMutation.mutateAsync({
        path: { user_id: user.id },
        body: { employment: changes.fields },
      })
    );
    if (!ok) return;
    setComparedRecord(currentEmployment);
    setSaved(changes.next);
    await refreshAfterSave(base.departmentId, changes.next.departmentId);
  }

  async function createRecord() {
    const ok = await attempt(() =>
      createEmploymentMutation.mutateAsync({
        path: { user_id: user.id },
        body: {
          employee_number: emp.employee_number.trim(),
          department_id: emp.department_id,
          position: emp.position.trim() || null,
        },
      })
    );
    if (!ok) return;
    // The create request sends no status or last day, so the record starts Active with no last day.
    setComparedRecord(currentEmployment);
    setSaved({
      departmentId: emp.department_id,
      employeeNumber: orNull(emp.employee_number),
      endDate: null,
      position: orNull(emp.position),
      status: "ACTIVE",
    });
    await refreshAfterSave(emp.department_id, emp.department_id);
  }

  /** Saves the form. Call only after any confirmation has been given. */
  async function saveEmployment() {
    setPendingReview(null);
    setSaveError(null);
    setNotice(null);
    if (!emp.department_id) {
      toast.error("Select a department first");
      return;
    }
    if (saved) {
      await saveChanges(saved);
      return;
    }
    if (!emp.employee_number.trim()) {
      toast.error("Employee number is required to assign a department");
      return;
    }
    await createRecord();
  }

  async function refreshAfterSave(
    previousDepartmentId: string,
    nextDepartmentId: string
  ) {
    // Refresh this user's employment, the users table, and the roster member
    // lists for both the old and new department (moving a person shows in both).
    await invalidateAfterEmploymentChange(queryClient, {
      userId: user.id,
      departmentIds: [previousDepartmentId, nextDepartmentId],
    });
    // A transfer, a status change or a last day ends roles, so the role list changes too.
    await queryClient.invalidateQueries({
      queryKey: authGetRoleAssignmentsQueryKey({ query: { user_id: user.id } }),
    });
    toast.success(`Updated employment for ${user.username}`);
  }

  /** Reloads the form from the server's record, dropping unsaved edits. */
  function loadLatest() {
    setPendingReview(null);
    setSaveError(null);
    setNotice(null);
    setEmpSeeded(false);
  }

  /** Save button: asks for confirmation first when the change ends roles. */
  function requestSave() {
    if (endDateProblem) return;
    if (saved && liveReview?.requiresConfirmation) {
      setPendingReview(liveReview);
      return;
    }
    saveEmployment();
  }

  if (isFetching && !empSeeded) {
    return (
      <div className="flex flex-col gap-3">
        <span className="font-medium text-sm">Department & employment</span>
        <span className="text-muted-foreground text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="font-medium text-sm">Department & employment</span>
      <Field>
        <FieldLabel htmlFor="mu-dept">Department</FieldLabel>
        <NativeSelect
          id="mu-dept"
          onChange={(e) => editEmployment({ department_id: e.target.value })}
          value={emp.department_id}
        >
          <option value="">Select department…</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {liveReview?.departmentMoves ? (
        <Alert variant="warning">
          <AlertDescription>{DEPARTMENT_TRANSFER_WARNING}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="mu-empno">Employee #</FieldLabel>
          <Input
            id="mu-empno"
            onChange={(e) =>
              editEmployment({ employee_number: e.target.value })
            }
            value={emp.employee_number}
          />
        </Field>
        <StatusField
          editable={saved !== null}
          onChange={(status) => editEmployment({ status })}
          value={emp.status}
        />
      </div>
      <Field>
        <FieldLabel htmlFor="mu-position">Position</FieldLabel>
        <Input
          id="mu-position"
          onChange={(e) => editEmployment({ position: e.target.value })}
          value={emp.position}
        />
      </Field>
      {saved ? (
        <Field>
          <FieldLabel htmlFor="mu-end">Last day of employment</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-describedby={
                endDateProblem ? "mu-end-help mu-end-error" : "mu-end-help"
              }
              aria-invalid={endDateProblem ? true : undefined}
              className="w-auto"
              id="mu-end"
              onChange={(e) => editEmployment({ end_date: e.target.value })}
              type="date"
              value={emp.end_date}
            />
            {emp.end_date ? (
              <Button
                onClick={() => editEmployment({ end_date: "" })}
                size="sm"
                type="button"
                variant="outline"
              >
                Clear last day
              </Button>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm" id="mu-end-help">
            {END_DATE_EXPLANATION}
          </p>
          {endDateProblem ? (
            <p
              className="text-destructive text-sm"
              id="mu-end-error"
              role="status"
            >
              {endDateProblem}
            </p>
          ) : null}
        </Field>
      ) : (
        <p className="text-muted-foreground text-sm">
          A last day can be recorded once the employment record is saved.
        </p>
      )}
      <ChangedElsewhereNotice
        onLoadLatest={loadLatest}
        show={changedElsewhere}
      />
      {saveError ? (
        <Alert role="alert" variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <p className="text-muted-foreground text-sm" role="status">
          {notice}
        </p>
      ) : null}
      <Button
        disabled={employmentBusy || !emp.department_id || !!endDateProblem}
        onClick={requestSave}
        size="sm"
        type="button"
        variant="outline"
      >
        {saved ? "Save employment" : "Assign to department"}
      </Button>
      <AlertDialog
        onOpenChange={(next) => {
          if (!next) setPendingReview(null);
        }}
        open={pendingReview !== null}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            Confirm change for {user.first_name} {user.last_name}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingReview?.confirmationLines.map((line) => (
              <span className="block" key={line}>
                {line}
              </span>
            ))}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              disabled={employmentBusy}
              onClick={saveEmployment}
            >
              Confirm and save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
