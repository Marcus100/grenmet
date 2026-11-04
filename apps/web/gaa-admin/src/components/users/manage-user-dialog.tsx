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
import { Alert, AlertDescription } from "@barrelsgd/ui/components/ui/alert";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
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
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { Separator } from "@barrelsgd/ui/components/ui/separator";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldMinus, UserRoundCog, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { hrApiErrorMessage } from "@/components/hr/api-error";
import { reportError } from "@/lib/report-error";

import { AccountActivation } from "./account-activation";
import { CmsAccessControl } from "./cms-access-control";
import { EmploymentSection } from "./employment-section";
import { SignInSetup } from "./sign-in-setup";

/** Shown while the person has no department record: roles cannot be assigned yet. */
export const NO_EMPLOYMENT_NOTICE =
  "Put this person in a department first (Department & employment). Roles can only be assigned once they belong to an employer.";

function statusOf(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    return typeof error.status === "number" ? error.status : undefined;
  }
  return undefined;
}

/** True once the employment lookup has settled on "no record yet" (a 404). */
function isMissingEmployment(query: {
  error: unknown;
  isError: boolean;
  isFetching: boolean;
}): boolean {
  return !query.isFetching && query.isError && statusOf(query.error) === 404;
}

/** Why Assign is greyed out, or null when it is ready. */
function assignHintFor({
  hasNoEmployment,
  roleDepartment,
  roleScope,
  roleCount,
}: {
  hasNoEmployment: boolean;
  roleDepartment: string;
  roleScope: RoleAssignmentScope;
  roleCount: number;
}): string | null {
  if (hasNoEmployment) {
    return "Add a department record first, then assign a role.";
  }
  if (roleCount === 0) return "Choose a role to enable Assign.";
  if (roleScope === "DEPARTMENT" && !roleDepartment) {
    return "Choose a department for the Department scope.";
  }
  return null;
}

/** A message in the Roles section; nothing when there is none. */
function RoleNotice({
  message,
  role,
  variant,
}: {
  message: string | null;
  role?: "alert";
  variant: "destructive" | "warning";
}) {
  if (!message) return null;
  return (
    <Alert role={role} variant={variant}>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/**
 * What to tell the person when a role assignment fails. A 4xx is a refusal with
 * a reason from the API; anything else is unexpected and is reported.
 */
function assignFailure(
  error: unknown,
  roleName: string
): { message: string; unexpected: boolean } {
  const status = statusOf(error);
  if (status !== undefined && status >= 400 && status < 500) {
    return {
      message: `${roleName} was not assigned: ${hrApiErrorMessage(error)}`,
      unexpected: false,
    };
  }
  return {
    message: `${roleName} was not assigned. Something went wrong; try again shortly.`,
    unexpected: true,
  };
}

/** What happened to one role in a batch: assigned, or refused with a message. */
type RoleOutcome =
  | { roleId: string; roleName: string; assigned: true }
  | { roleId: string; roleName: string; assigned: false; message: string };

/**
 * Per-role result of a batch. Successes and refusals are shown together, so a
 * refusal never hides the roles that were assigned.
 */
function RoleResults({ results }: { results: RoleOutcome[] }) {
  const assigned = results.filter((result) => result.assigned);
  const refused = results.filter((result) => !result.assigned);
  return (
    <div className="flex flex-col gap-2" data-slot="role-assign-results">
      {assigned.length > 0 ? (
        <Alert role="status" variant="info">
          <AlertDescription>
            Assigned: {assigned.map((result) => result.roleName).join(", ")}.
          </AlertDescription>
        </Alert>
      ) : null}
      {refused.length > 0 ? (
        <Alert variant="destructive">
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {refused.map((result) => (
                <li key={result.roleId}>
                  {result.assigned ? null : result.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

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
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [roleScope, setRoleScope] = useState<RoleAssignmentScope>("SELF");
  const [roleDepartment, setRoleDepartment] = useState("");
  const [roleExpiry, setRoleExpiry] = useState("");
  const [roleResults, setRoleResults] = useState<RoleOutcome[] | null>(null);
  const [assigning, setAssigning] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (!next) setRoleResults(null);
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

  // A 404 means "no employment record yet" (expected); other failures are not
  // treated as a missing record, so a network blip does not block assigning.
  const hasNoEmployment = isMissingEmployment(employmentQuery);

  const assignHint = assignHintFor({
    hasNoEmployment,
    roleDepartment,
    roleScope,
    roleCount: selectedRoleIds.length,
  });

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: authGetRoleAssignmentsQueryKey({
        query: {
          user_id: user.id,
        },
      }),
    });
  }

  function toggleRole(roleId: string, checked: boolean) {
    setRoleResults(null);
    setSelectedRoleIds((current) => {
      if (!checked) return current.filter((id) => id !== roleId);
      return current.includes(roleId) ? current : [...current, roleId];
    });
  }

  /** Assigns one role with the current scope fields and returns its outcome. */
  async function assignOne(role: RolePublic): Promise<RoleOutcome> {
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
      return { roleId: role.id, roleName: role.name, assigned: true };
    } catch (error) {
      const failure = assignFailure(error, role.name);
      if (failure.unexpected) reportError(error, "hr-role-assign");
      return {
        roleId: role.id,
        roleName: role.name,
        assigned: false,
        message: failure.message,
      };
    }
  }

  /**
   * Assigns each selected role with the same scope fields, one call at a time.
   * A refusal on one role does not stop the others; every outcome is shown.
   * Roles that were assigned leave the selection; refused ones stay ticked so
   * the admin can retry or untick them.
   */
  async function addRoles() {
    const chosen = roles.filter((r) => selectedRoleIds.includes(r.id));
    if (chosen.length === 0) return;
    setRoleResults(null);
    setAssigning(true);
    try {
      const outcomes: RoleOutcome[] = [];
      for (const role of chosen) {
        outcomes.push(await assignOne(role));
      }
      const assignedIds = outcomes
        .filter((outcome) => outcome.assigned)
        .map((outcome) => outcome.roleId);
      if (assignedIds.length > 0) await refresh();
      setSelectedRoleIds((current) =>
        current.filter((id) => !assignedIds.includes(id))
      );
      setRoleResults(outcomes);
      if (assignedIds.length === outcomes.length) {
        toast.success(
          `Assigned ${chosen.map((r) => r.name).join(", ")} to ${user.username}`
        );
      }
    } finally {
      setAssigning(false);
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
      <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {user.first_name} {user.last_name}
          </DialogTitle>
          <DialogDescription>
            @{user.username} — roles and account access.
          </DialogDescription>
        </DialogHeader>

        {/* One column on phones; md and up, two columns in reading order
            (account | CMS, then employment | roles), so tab order matches.
            Employment comes first because a role can only be assigned to a
            person who already belongs to a department. */}
        <div
          className="grid gap-6 md:grid-cols-2 md:gap-x-8"
          data-slot="manage-user-sections"
        >
          <div className="min-w-0">
            <AccountActivation open={open} user={user} />
            <SignInSetup open={open} user={user} />
          </div>
          <div className="min-w-0">
            <CmsAccessControl open={open} user={user} />
          </div>
          <div className="min-w-0">
            <EmploymentSection
              currentEmployment={employmentQuery.data}
              departments={departments}
              isFetching={
                employmentQuery.isFetching || departmentsQuery.isFetching
              }
              open={open}
              user={user}
            />
          </div>

          <div
            className="flex min-w-0 flex-col gap-3"
            data-slot="manage-user-roles"
          >
            <span className="text-sm font-medium">Roles</span>
            <RoleNotice
              message={hasNoEmployment ? NO_EMPLOYMENT_NOTICE : null}
              variant="warning"
            />
            {!isSuperuser && (
              <p className="text-muted-foreground text-sm">
                You may grant ordinary staff self-service within your active
                department. Managers, supervisors and special duties are
                appointed by a system administrator. Delegated access ends when
                your authority ends.
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
                  <Badge
                    className="h-auto max-w-full min-w-0 text-left break-words whitespace-normal"
                    key={assignment.id}
                    variant="secondary"
                  >
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
                      className="hover:text-destructive ml-1 rounded-sm"
                      disabled={revokeMutation.isPending}
                      onClick={() =>
                        revoke(assignment.id, role?.name ?? "role")
                      }
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
                    ) {
                      setRoleScope(value);
                      setRoleResults(null);
                    }
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
                onChange={(event) => {
                  setRoleDepartment(event.target.value);
                  setRoleResults(null);
                }}
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
            {roleResults ? <RoleResults results={roleResults} /> : null}
            <fieldset
              className="flex flex-col gap-2"
              data-slot="role-checkboxes"
            >
              <legend className="text-sm font-medium">Roles to add</legend>
              {assignableRoles.length === 0 ? (
                <span className="text-muted-foreground text-sm">
                  No roles left to add.
                </span>
              ) : null}
              {assignableRoles.map((r) => (
                <label className="flex items-center gap-2 text-sm" key={r.id}>
                  <Checkbox
                    checked={selectedRoleIds.includes(r.id)}
                    disabled={assigning}
                    onCheckedChange={(checked) => toggleRole(r.id, checked)}
                  />
                  {r.name}
                </label>
              ))}
            </fieldset>
            <div className="flex items-center justify-end gap-2">
              <Button
                aria-describedby={assignHint ? "assign-hint" : undefined}
                disabled={assignHint !== null || assigning}
                onClick={addRoles}
                size="sm"
                type="button"
                variant="outline"
              >
                Assign
              </Button>
            </div>
            {assignHint ? (
              <p className="text-muted-foreground text-sm" id="assign-hint">
                {assignHint}
              </p>
            ) : null}
          </div>

          <div className="md:col-span-2">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
