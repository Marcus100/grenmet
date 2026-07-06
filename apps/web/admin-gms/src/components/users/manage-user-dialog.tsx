"use client";

import {
  type EmploymentStatus,
  type SrcAuthSchemasRolePublic as RolePublic,
  readRoleAssignmentsApiV1AuthRoleAssignmentsGetQueryKey,
  readUsersApiV1AuthUsersGetQueryKey,
  type UserPublic,
  useCreateHrEmploymentApiV1HrEmploymentUserIdPost,
  useCreateRoleAssignmentApiV1AuthRoleAssignmentsPost,
  useDeleteRoleAssignmentApiV1AuthRoleAssignmentsAssignmentIdDelete,
  useListDepartmentsEndpointApiV1HrDepartmentsGet,
  useReadHrEmploymentApiV1HrEmploymentUserIdGet,
  useReadRoleAssignmentsApiV1AuthRoleAssignmentsGet,
  useUpdateHrEmploymentApiV1HrEmploymentUserIdPatch,
  useUpdateUserApiV1AuthUsersUserIdPatch,
} from "@grenmet/api-client";
import { Badge } from "@grenmet/ui/components/ui/badge";
import { Button } from "@grenmet/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@grenmet/ui/components/ui/dialog";
import { Field, FieldLabel } from "@grenmet/ui/components/ui/field";
import { Input } from "@grenmet/ui/components/ui/input";
import { NativeSelect } from "@grenmet/ui/components/ui/native-select";
import { Separator } from "@grenmet/ui/components/ui/separator";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldMinus, UserRoundCog, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { invalidateAfterEmploymentChange } from "@/lib/hr-invalidation";

interface ManageUserDialogProps {
  onOpenChange?: (open: boolean) => void;
  /** Controlled open state. When provided, the built-in trigger is hidden. */
  open?: boolean;
  roles: RolePublic[];
  user: UserPublic;
}

export function ManageUserDialog({
  user,
  roles,
  open: controlledOpen,
  onOpenChange,
}: ManageUserDialogProps) {
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const [roleToAdd, setRoleToAdd] = useState("");

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const assignmentsQuery = useReadRoleAssignmentsApiV1AuthRoleAssignmentsGet(
    { user_id: user.id },
    { query: { enabled: open } }
  );
  const assignments = assignmentsQuery.data?.data ?? [];
  const rolesById = new Map(roles.map((r) => [r.id, r]));
  const heldRoleIds = new Set(assignments.map((a) => a.role_id));
  const assignableRoles = roles.filter((r) => !heldRoleIds.has(r.id));

  const assignMutation = useCreateRoleAssignmentApiV1AuthRoleAssignmentsPost();
  const revokeMutation =
    useDeleteRoleAssignmentApiV1AuthRoleAssignmentsAssignmentIdDelete();
  const updateUserMutation = useUpdateUserApiV1AuthUsersUserIdPatch();

  const departmentsQuery = useListDepartmentsEndpointApiV1HrDepartmentsGet({
    query: { enabled: open },
  });
  const departments = departmentsQuery.data?.data ?? [];
  // 404 (no record yet) is expected — retry:false so it doesn't refetch.
  const employmentQuery = useReadHrEmploymentApiV1HrEmploymentUserIdGet(
    user.id,
    {
      query: { enabled: open, retry: false },
    }
  );
  const currentEmployment = employmentQuery.data;
  const createEmploymentMutation =
    useCreateHrEmploymentApiV1HrEmploymentUserIdPost();
  const updateEmploymentMutation =
    useUpdateHrEmploymentApiV1HrEmploymentUserIdPatch();

  const [emp, setEmp] = useState({
    department_id: "",
    employee_number: "",
    position: "",
    status: "ACTIVE" as EmploymentStatus,
  });
  const [empSeeded, setEmpSeeded] = useState(false);
  const employmentBusy =
    createEmploymentMutation.isPending || updateEmploymentMutation.isPending;

  // Seed the employment form once per open, after the read + departments settle.
  // A 404 leaves currentEmployment undefined → blank fields, "assign" (create) mode.
  useEffect(() => {
    if (!open) {
      setEmpSeeded(false);
      return;
    }
    if (
      empSeeded ||
      employmentQuery.isFetching ||
      departmentsQuery.isFetching
    ) {
      return;
    }
    setEmp({
      department_id:
        currentEmployment?.department_id ?? departments[0]?.id ?? "",
      employee_number: currentEmployment?.employee_number ?? "",
      position: currentEmployment?.position ?? "",
      status: currentEmployment?.status ?? "ACTIVE",
    });
    setEmpSeeded(true);
  }, [
    open,
    empSeeded,
    employmentQuery.isFetching,
    departmentsQuery.isFetching,
    currentEmployment,
    departments,
  ]);

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: readRoleAssignmentsApiV1AuthRoleAssignmentsGetQueryKey({
        user_id: user.id,
      }),
    });
  }

  async function addRole() {
    const role = roles.find((r) => r.name === roleToAdd);
    if (!role) return;
    await assignMutation.mutateAsync({
      data: { user_id: user.id, role_id: role.id },
    });
    await refresh();
    setRoleToAdd("");
    toast.success(`Assigned ${role.name} to ${user.username}`);
  }

  async function revoke(assignmentId: string, roleName: string) {
    await revokeMutation.mutateAsync({ assignment_id: assignmentId });
    await refresh();
    toast.success(`Revoked ${roleName} from ${user.username}`);
  }

  async function toggleActive() {
    await updateUserMutation.mutateAsync({
      user_id: user.id,
      data: { is_active: !user.is_active },
    });
    await queryClient.invalidateQueries({
      queryKey: readUsersApiV1AuthUsersGetQueryKey(),
    });
    toast.success(
      `${user.username} ${user.is_active ? "deactivated" : "reactivated"}`
    );
  }

  async function saveEmployment() {
    if (!emp.department_id) {
      toast.error("Select a department first");
      return;
    }
    const previousDepartmentId = currentEmployment?.department_id;
    if (currentEmployment) {
      await updateEmploymentMutation.mutateAsync({
        user_id: user.id,
        data: {
          employment: {
            department_id: emp.department_id,
            employee_number: emp.employee_number.trim() || null,
            position: emp.position.trim() || null,
            status: emp.status,
          },
        },
      });
    } else {
      if (!emp.employee_number.trim()) {
        toast.error("Employee number is required to assign a department");
        return;
      }
      await createEmploymentMutation.mutateAsync({
        user_id: user.id,
        data: {
          employee_number: emp.employee_number.trim(),
          department_id: emp.department_id,
          position: emp.position.trim() || null,
        },
      });
    }
    // Refresh this user's employment, the users table, and the roster member
    // lists for both the old and new department (moving a person shows in both).
    await invalidateAfterEmploymentChange(queryClient, {
      userId: user.id,
      departmentIds: [previousDepartmentId, emp.department_id],
    });
    toast.success(`Updated employment for ${user.username}`);
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      {isControlled ? null : (
        <DialogTrigger
          render={<Button size="sm" type="button" variant="outline" />}
        >
          <UserRoundCog data-icon="inline-start" />
          Manage
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {user.first_name} {user.last_name}
          </DialogTitle>
          <DialogDescription>
            @{user.username} — roles and account access.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <span className="font-medium text-sm">Roles</span>
          {assignments.length === 0 && !assignmentsQuery.isLoading ? (
            <span className="text-muted-foreground text-sm">
              No roles assigned.
            </span>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {assignments.map((assignment) => {
              const role = rolesById.get(assignment.role_id);
              return (
                <Badge key={assignment.id} variant="secondary">
                  {role?.name ?? assignment.role_id}
                  <button
                    aria-label={`Revoke ${role?.name ?? "role"}`}
                    className="ml-1 rounded-sm hover:text-destructive"
                    disabled={revokeMutation.isPending}
                    onClick={() => revoke(assignment.id, role?.name ?? "role")}
                    type="button"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <NativeSelect
              aria-label="Role to assign"
              className="flex-1"
              onChange={(e) => setRoleToAdd(e.target.value)}
              value={roleToAdd}
            >
              <option value="">Add a role…</option>
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </NativeSelect>
            <Button
              disabled={!roleToAdd || assignMutation.isPending}
              onClick={addRole}
              size="sm"
              type="button"
              variant="outline"
            >
              Assign
            </Button>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <span className="font-medium text-sm">Department & employment</span>
            {employmentQuery.isFetching && !empSeeded ? (
              <span className="text-muted-foreground text-sm">Loading…</span>
            ) : (
              <>
                <Field>
                  <FieldLabel htmlFor="mu-dept">Department</FieldLabel>
                  <NativeSelect
                    id="mu-dept"
                    onChange={(e) =>
                      setEmp((s) => ({ ...s, department_id: e.target.value }))
                    }
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
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="mu-empno">Employee #</FieldLabel>
                    <Input
                      id="mu-empno"
                      onChange={(e) =>
                        setEmp((s) => ({
                          ...s,
                          employee_number: e.target.value,
                        }))
                      }
                      value={emp.employee_number}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="mu-status">Status</FieldLabel>
                    <NativeSelect
                      id="mu-status"
                      onChange={(e) =>
                        setEmp((s) => ({
                          ...s,
                          status: e.target.value as EmploymentStatus,
                        }))
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
                    onChange={(e) =>
                      setEmp((s) => ({ ...s, position: e.target.value }))
                    }
                    value={emp.position}
                  />
                </Field>
                <Button
                  disabled={employmentBusy || !emp.department_id}
                  onClick={saveEmployment}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {currentEmployment
                    ? "Save employment"
                    : "Assign to department"}
                </Button>
              </>
            )}
          </div>

          <Separator />

          <DialogFooter>
            <Button
              disabled={updateUserMutation.isPending}
              onClick={toggleActive}
              type="button"
              variant={user.is_active ? "destructive" : "default"}
            >
              <ShieldMinus data-icon="inline-start" />
              {user.is_active ? "Deactivate account" : "Reactivate account"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
