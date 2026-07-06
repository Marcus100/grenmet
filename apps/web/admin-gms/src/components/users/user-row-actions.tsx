"use client";

import {
  type SrcAuthSchemasRolePublic as RolePublic,
  readUsersApiV1AuthUsersGetQueryKey,
  type UserPublic,
  useUpdateUserApiV1AuthUsersUserIdPatch,
} from "@grenmet/api-client";
import { Button } from "@grenmet/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@grenmet/ui/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ManageUserDialog } from "./manage-user-dialog";

export function UserRowActions({
  row,
  roles,
}: {
  row: { user: UserPublic; name: string };
  roles: RolePublic[];
}) {
  const { user, name } = row;
  const queryClient = useQueryClient();
  const [manageOpen, setManageOpen] = useState(false);
  const updateUserMutation = useUpdateUserApiV1AuthUsersUserIdPatch();

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
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={`Open actions for ${name}`}
              className="size-8 rounded-md text-muted-foreground hover:bg-muted/50"
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setManageOpen(true)}>
              Manage roles &amp; access
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled={updateUserMutation.isPending}
              onClick={toggleActive}
              variant={user.is_active ? "destructive" : "default"}
            >
              {user.is_active ? "Deactivate user" : "Reactivate account"}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <ManageUserDialog
        onOpenChange={setManageOpen}
        open={manageOpen}
        roles={roles}
        user={user}
      />
    </>
  );
}
