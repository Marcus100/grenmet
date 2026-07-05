"use client";

import {
  useReadRolesApiV1AuthRolesGet,
  useReadUsersApiV1AuthUsersGet,
} from "@grenmet/api-client";
import { Badge } from "@grenmet/ui/components/ui/badge";
import { Input } from "@grenmet/ui/components/ui/input";
import { Search } from "lucide-react";
import { useState } from "react";
import { CreateUserDialog } from "./create-user-dialog";
import { ManageUserDialog } from "./manage-user-dialog";

export function UsersManager() {
  const [search, setSearch] = useState("");

  const usersQuery = useReadUsersApiV1AuthUsersGet({ page: 1, size: 100 });
  const rolesQuery = useReadRolesApiV1AuthRolesGet({ page: 1, size: 100 });
  const roles = rolesQuery.data?.data ?? [];

  const term = search.trim().toLowerCase();
  const users = (usersQuery.data?.data ?? []).filter((user) => {
    if (!term) return true;
    return [user.first_name, user.last_name, user.username, user.email]
      .join(" ")
      .toLowerCase()
      .includes(term);
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search users"
            className="w-64 pl-8"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, username, email…"
            value={search}
          />
        </div>
        <CreateUserDialog roles={roles} />
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Username</th>
              <th className="px-3 py-2 font-semibold">Email</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr className="border-border border-t" key={user.id}>
                <td className="px-3 py-2 font-medium">
                  {user.first_name} {user.last_name}
                  {user.is_superuser ? (
                    <Badge className="ml-2" variant="outline">
                      superuser
                    </Badge>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {user.username}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {user.email}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={user.is_active ? "default" : "secondary"}>
                    {user.is_active ? "active" : "inactive"}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  <ManageUserDialog roles={roles} user={user} />
                </td>
              </tr>
            ))}
            {users.length === 0 && !usersQuery.isLoading ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={5}>
                  No users match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
