"use client";

import {
  readRolesApiV1AuthRolesGetQueryKey,
  useDeleteRoleApiV1AuthRolesRoleIdDelete,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@barrelsgd/ui/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import type { RoleRow } from "./roles-row";

/**
 * Row actions for a role. System roles are provisioned by onboarding
 * (`position-roles.ts`), so deleting one would break role assignment — the
 * destructive item is disabled for them.
 */
export function RoleRowActions({ row }: { row: RoleRow }) {
  const queryClient = useQueryClient();
  const deleteRoleMutation = useDeleteRoleApiV1AuthRolesRoleIdDelete();
  const isSystemRole = row.type === "System";

  async function copyRoleId() {
    await navigator.clipboard.writeText(row.id);
    toast.success("Role ID copied");
  }

  async function deleteRole() {
    try {
      await deleteRoleMutation.mutateAsync({ path: { role_id: row.id } });
      await queryClient.invalidateQueries({
        queryKey: readRolesApiV1AuthRolesGetQueryKey(),
      });
      toast.success(`Deleted role "${row.name}"`);
    } catch {
      toast.error(`Could not delete role "${row.name}"`);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${row.name}`}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={copyRoleId}>Copy role ID</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={isSystemRole || deleteRoleMutation.isPending}
            onClick={deleteRole}
            variant="destructive"
          >
            Delete role
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
