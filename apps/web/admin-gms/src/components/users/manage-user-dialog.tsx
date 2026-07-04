"use client";

import {
  type SrcAuthSchemasRolePublic as RolePublic,
  readRoleAssignmentsApiV1AuthRoleAssignmentsGetQueryKey,
  readUsersApiV1AuthUsersGetQueryKey,
  type UserPublic,
  useCreateRoleAssignmentApiV1AuthRoleAssignmentsPost,
  useDeleteRoleAssignmentApiV1AuthRoleAssignmentsAssignmentIdDelete,
  useReadRoleAssignmentsApiV1AuthRoleAssignmentsGet,
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
import { NativeSelect } from "@grenmet/ui/components/ui/native-select";
import { Separator } from "@grenmet/ui/components/ui/separator";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldMinus, UserRoundCog, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ManageUserDialogProps {
  roles: RolePublic[];
  user: UserPublic;
}

export function ManageUserDialog({ user, roles }: ManageUserDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [roleToAdd, setRoleToAdd] = useState("");

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

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={<Button size="sm" type="button" variant="outline" />}
      >
        <UserRoundCog data-icon="inline-start" />
        Manage
      </DialogTrigger>
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
