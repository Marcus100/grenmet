"use client";

import {
  authGetRoleAssignmentsQueryKey,
  type DepartmentPublic,
  type EmploymentRecordPublic,
  type EmploymentStatus,
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
  // Set when a save needs the admin to confirm first (transfer, or a last day
  // today or earlier). Cleared by any edit, so the confirmation always matches the form.
  const [pendingReview, setPendingReview] =
    useState<EmploymentChangeReview | null>(null);
  // Plain-words reason the API refused the last save. Shown on the form.
  const [saveError, setSaveError] = useState<string | null>(null);

  const today = grenadaToday();
  const savedEndDate = currentEmployment?.end_date ?? null;
  const draftEndDate = emp.end_date || null;
  const endDateProblem = currentEmployment
    ? lastDayError(emp.end_date, currentEmployment.start_date)
    : null;
  const liveReview = currentEmployment
    ? reviewEmploymentChange({
        current: {
          departmentId: currentEmployment.department_id,
          endDate: savedEndDate,
        },
        next: {
          departmentId: emp.department_id,
          endDate: draftEndDate,
          status: emp.status,
        },
        today,
      })
    : null;

  // Seed the form once per open, after the read + departments settle.
  // No record (404) leaves currentEmployment undefined → blank fields, "assign" (create) mode.
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
    setEmpSeeded(true);
  }, [open, empSeeded, isFetching, currentEmployment, departments]);

  function editEmployment(patch: Partial<EmploymentDraft>) {
    setEmp((s) => ({ ...s, ...patch }));
    setPendingReview(null);
    setSaveError(null);
  }

  /** Saves the form. Call only after any confirmation has been given. */
  async function saveEmployment() {
    setPendingReview(null);
    setSaveError(null);
    if (!emp.department_id) {
      toast.error("Select a department first");
      return;
    }
    const previousDepartmentId = currentEmployment?.department_id;
    try {
      if (currentEmployment) {
        // The last day is sent only when it changed, so a form loaded before
        // someone else set a date cannot silently clear it.
        const endDateChanged = draftEndDate !== savedEndDate;
        await updateEmploymentMutation.mutateAsync({
          path: { user_id: user.id },
          body: {
            employment: {
              department_id: emp.department_id,
              employee_number: emp.employee_number.trim() || null,
              position: emp.position.trim() || null,
              status: emp.status,
              ...(endDateChanged ? { end_date: draftEndDate } : {}),
            },
          },
        });
      } else {
        if (!emp.employee_number.trim()) {
          toast.error("Employee number is required to assign a department");
          return;
        }
        await createEmploymentMutation.mutateAsync({
          path: { user_id: user.id },
          body: {
            employee_number: emp.employee_number.trim(),
            department_id: emp.department_id,
            position: emp.position.trim() || null,
          },
        });
      }
    } catch (error) {
      const failure = employmentSaveFailure(error);
      if (failure.unexpected) reportError(error, "hr-employment");
      setSaveError(failure.message);
      return;
    }
    // Refresh this user's employment, the users table, and the roster member
    // lists for both the old and new department (moving a person shows in both).
    await invalidateAfterEmploymentChange(queryClient, {
      userId: user.id,
      departmentIds: [previousDepartmentId, emp.department_id],
    });
    // A transfer or a last day ends roles, so the role list changes too.
    await queryClient.invalidateQueries({
      queryKey: authGetRoleAssignmentsQueryKey({ query: { user_id: user.id } }),
    });
    toast.success(`Updated employment for ${user.username}`);
  }

  /** Save button: asks for confirmation first when the change ends roles. */
  function requestSave() {
    if (endDateProblem) return;
    if (currentEmployment && liveReview?.requiresConfirmation) {
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
        <Field>
          <FieldLabel htmlFor="mu-status">Status</FieldLabel>
          <NativeSelect
            id="mu-status"
            onChange={(e) =>
              editEmployment({ status: e.target.value as EmploymentStatus })
            }
            value={emp.status}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="TERMINATED">Terminated</option>
          </NativeSelect>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="mu-position">Position</FieldLabel>
        <Input
          id="mu-position"
          onChange={(e) => editEmployment({ position: e.target.value })}
          value={emp.position}
        />
      </Field>
      {currentEmployment ? (
        <Field>
          <FieldLabel htmlFor="mu-end">Last day of employment</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-describedby="mu-end-help"
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
            <p className="text-destructive text-sm" role="status">
              {endDateProblem}
            </p>
          ) : null}
        </Field>
      ) : (
        <p className="text-muted-foreground text-sm">
          A last day can be recorded once the employment record is saved.
        </p>
      )}
      {saveError ? (
        <Alert role="alert" variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        disabled={employmentBusy || !emp.department_id}
        onClick={requestSave}
        size="sm"
        type="button"
        variant="outline"
      >
        {currentEmployment ? "Save employment" : "Assign to department"}
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
