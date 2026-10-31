"use client";

import {
  authGetOnboardingStatusQueryKey,
  authGetRoleAssignmentsQueryKey,
  authGetUsersQueryKey,
  type RoleAssignmentScope,
  type RolePublic,
  type UserPublic,
  useAuthCreateRoleAssignment,
  useAuthDeleteRoleAssignment,
  useAuthGetRoleAssignments,
  useAuthUpdateUser,
  useHrGetHrEmployment,
  useHrListDepartments,
} from "@barrelsgd/api-client";
import { useSessionUser } from "@barrelsgd/auth";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@barrelsgd/ui/components/ui/dialog";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { Separator } from "@barrelsgd/ui/components/ui/separator";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldMinus, UserRoundCog, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AccountActivation } from "./account-activation";
import { CmsAccessControl } from "./cms-access-control";
import { EmploymentSection } from "./employment-section";
import { SignInSetup } from "./sign-in-setup";

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
  const actor = useSessionUser();
  const isSuperuser = actor?.is_superuser === true;
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const [roleToAdd, setRoleToAdd] = useState("");
  const [roleScope, setRoleScope] = useState<RoleAssignmentScope>("SELF");
  const [roleDepartment, setRoleDepartment] = useState("");
  const [roleExpiry, setRoleExpiry] = useState("");

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const assignmentsQuery = useAuthGetRoleAssignments(
    { query: { user_id: user.id } },
    { query: { enabled: open } }
  );
  const assignments = assignmentsQuery.data?.data ?? [];
  const rolesById = new Map(roles.map((r) => [r.id, r]));
  const heldRoleIds = new Set(
    assignments.filter((a) => a.is_effective !== false).map((a) => a.role_id)
  );
  const assignableRoles = roles.filter((r) => !heldRoleIds.has(r.id));

  const assignMutation = useAuthCreateRoleAssignment();
  const revokeMutation = useAuthDeleteRoleAssignment();
  const updateUserMutation = useAuthUpdateUser();

  const departmentsQuery = useHrListDepartments(
    {},
    {
      query: { enabled: open },
    }
  );
  const departments = departmentsQuery.data?.data ?? [];
  // 404 (no record yet) is expected — retry:false so it doesn't refetch.
  const employmentQuery = useHrGetHrEmployment(
    { path: { user_id: user.id } },
    {
      query: { enabled: open, retry: false },
    }
  );

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: authGetRoleAssignmentsQueryKey({
        query: {
          user_id: user.id,
        },
      }),
    });
  }

  async function addRole() {
    const role = roles.find((r) => r.name === roleToAdd);
    if (!role) return;
    try {
      await assignMutation.mutateAsync({
        body: {
          user_id: user.id,
          role_id: role.id,
          organisation_id: employmentQuery.data?.organisation_id,
          scope: isSuperuser ? roleScope : "SELF",
          department_id:
            isSuperuser && roleScope === "DEPARTMENT" ? roleDepartment : null,
          effective_to: roleExpiry
            ? new Date(`${roleExpiry}Z`).toISOString()
            : null,
        },
      });
      await refresh();
      setRoleToAdd("");
      toast.success(`Assigned ${role.name} to ${user.username}`);
    } catch {
      toast.error(
        "Unable to assign role. Check the scope, department and expiry."
      );
    }
  }

  async function revoke(assignmentId: string, roleName: string) {
    await revokeMutation.mutateAsync({ path: { assignment_id: assignmentId } });
    await refresh();
    toast.success(`Revoked ${roleName} from ${user.username}`);
  }

  async function toggleActive() {
    await updateUserMutation.mutateAsync({
      path: { user_id: user.id },
      body: { is_active: !user.is_active },
    });
    await queryClient.invalidateQueries({
      queryKey: authGetUsersQueryKey({}),
    });
    await queryClient.invalidateQueries({
      queryKey: authGetOnboardingStatusQueryKey({ path: { user_id: user.id } }),
    });
    toast.success(
      `${user.username} ${user.is_active ? "deactivated" : "reactivated"}`
    );
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
      <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {user.first_name} {user.last_name}
          </DialogTitle>
          <DialogDescription>
            @{user.username} — roles and account access.
          </DialogDescription>
        </DialogHeader>

        <AccountActivation open={open} user={user} />
        <SignInSetup open={open} user={user} />
        <CmsAccessControl open={open} user={user} />
        <div className="flex flex-col gap-3">
          <span className="font-medium text-sm">Roles</span>
          {!isSuperuser && (
            <p className="text-muted-foreground text-sm">
              You may grant ordinary staff self-service within your active
              department. Managers, supervisors and special duties are appointed
              by a system administrator. Delegated access ends when your
              authority ends.
            </p>
          )}
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
                  {role?.name ?? assignment.role_id} · {assignment.scope}
                  {assignment.is_effective === false ? " · inactive" : ""}
                  {assignment.authority_assignment_id ? " · delegated" : ""}
                  {assignment.department_id
                    ? ` / ${assignment.department_id}`
                    : ""}
                  {assignment.effective_to
                    ? ` · ends ${assignment.effective_to}`
                    : ""}
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
          {isSuperuser && (
            <label className="space-y-1 text-sm" htmlFor="assignment-scope">
              Assignment scope
              <NativeSelect
                aria-label="Assignment scope"
                id="assignment-scope"
                onChange={(event) => {
                  const value = event.target.value;
                  if (
                    value === "SELF" ||
                    value === "DEPARTMENT" ||
                    value === "ALL"
                  )
                    setRoleScope(value);
                }}
                value={roleScope}
              >
                <option value="SELF">Self</option>
                <option value="DEPARTMENT">Department</option>
                <option value="ALL">All departments</option>
              </NativeSelect>
            </label>
          )}
          {isSuperuser && roleScope === "DEPARTMENT" && (
            <NativeSelect
              aria-label="Assignment department"
              onChange={(event) => setRoleDepartment(event.target.value)}
              value={roleDepartment}
            >
              <option value="">Choose department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </NativeSelect>
          )}
          <label className="space-y-1 text-sm" htmlFor="assignment-expiry">
            Access expires at (UTC, optional)
            <Input
              aria-label="Access expiry"
              id="assignment-expiry"
              onChange={(event) => setRoleExpiry(event.target.value)}
              type="datetime-local"
              value={roleExpiry}
            />
          </label>
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
              disabled={
                !roleToAdd ||
                assignMutation.isPending ||
                (roleScope === "DEPARTMENT" && !roleDepartment)
              }
              onClick={addRole}
              size="sm"
              type="button"
              variant="outline"
            >
              Assign
            </Button>
          </div>

          <Separator />

          <EmploymentSection
            currentEmployment={employmentQuery.data}
            departments={departments}
            isFetching={
              employmentQuery.isFetching || departmentsQuery.isFetching
            }
            open={open}
            user={user}
          />

          <Separator />

          {isSuperuser && (
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
