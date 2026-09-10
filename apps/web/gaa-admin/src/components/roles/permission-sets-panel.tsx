"use client";
import {
  type RoleConfiguration,
  readPermissionsApiV1AuthPermissionsGet,
  readRoleConfigurationApiV1HrSetupRolesGet,
  updateRoleConfigurationApiV1HrSetupRolesRoleIdPut,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

function PermissionEditor({
  role,
  catalog,
}: {
  role: RoleConfiguration;
  catalog: { key?: string | null; description?: string }[];
}) {
  const client = useQueryClient();
  const [keys, setKeys] = useState(role.permission_keys);
  const save = useMutation({
    mutationFn: () =>
      updateRoleConfigurationApiV1HrSetupRolesRoleIdPut({
        path: { role_id: role.id },
        body: { permission_keys: keys },
      }).unwrap(),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["permission-bundles"] }),
  });
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">
        {role.name} · {role.permission_keys.length} permissions
      </summary>
      <p className="py-2 text-sm">
        Changes affect everyone holding this role. Department scope is set on
        each assignment.
      </p>
      <div className="grid gap-2 py-3 md:grid-cols-2">
        {catalog.map((permission) =>
          permission.key ? (
            <label
              className="flex items-start gap-2 text-sm"
              key={permission.key}
            >
              <input
                checked={keys.includes(permission.key)}
                onChange={(event) => {
                  const key = permission.key;
                  if (key)
                    setKeys((current) =>
                      event.target.checked
                        ? [...current, key]
                        : current.filter((value) => value !== key)
                    );
                }}
                type="checkbox"
              />
              <span>
                {permission.key}
                <span className="block text-muted-foreground">
                  {permission.description}
                </span>
              </span>
            </label>
          ) : null
        )}
      </div>
      <Button disabled={save.isPending} onClick={() => save.mutate()}>
        Save {role.name} permissions
      </Button>
      {save.isSuccess && <p role="status">Permissions saved.</p>}
      {save.isError && <p role="alert">Unable to save permissions.</p>}
    </details>
  );
}
export function PermissionSetsPanel() {
  const roles = useQuery({
    queryKey: ["permission-bundles"],
    queryFn: () => readRoleConfigurationApiV1HrSetupRolesGet({}).unwrap(),
  });
  const permissions = useQuery({
    queryKey: ["permission-catalogue"],
    queryFn: async () => {
      const first = await readPermissionsApiV1AuthPermissionsGet({
        query: { page: 1, size: 100 },
      }).unwrap();
      const all = [...first.data];
      for (let page = 2; all.length < first.count; page++) {
        const next = await readPermissionsApiV1AuthPermissionsGet({
          query: { page, size: 100 },
        }).unwrap();
        if (!next.data.length) break;
        all.push(...next.data);
      }
      return all;
    },
  });
  if (roles.isPending || permissions.isPending)
    return <p>Loading permissions…</p>;
  if (roles.isError || permissions.isError)
    return (
      <p role="alert">
        Unable to load permissions. Administrator access is required.
      </p>
    );
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-xl">Permission sets</h2>
      <p>
        Grant only the capabilities needed for a task. Job titles do not grant
        these permissions.
      </p>
      {roles.data.map((role) => (
        <PermissionEditor
          catalog={permissions.data}
          key={role.id}
          role={role}
        />
      ))}
    </section>
  );
}
