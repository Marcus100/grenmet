"use client";

import {
  type SrcAuthSchemasRolePublic as RolePublic,
  useCreateHrEmploymentApiV1HrEmploymentUserIdPost,
  useCreateRoleAssignmentApiV1AuthRoleAssignmentsPost,
  useCreateUserApiV1AuthUsersPost,
  useListDepartmentsEndpointApiV1HrDepartmentsGet,
} from "@grenmet/api-client";
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
import { Field, FieldGroup, FieldLabel } from "@grenmet/ui/components/ui/field";
import { Input } from "@grenmet/ui/components/ui/input";
import { NativeSelect } from "@grenmet/ui/components/ui/native-select";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { invalidateAfterUserOnboard } from "@/lib/hr-invalidation";
import {
  GMS_POSITIONS,
  rolesToAssign,
  suggestedRoleForPosition,
} from "./position-roles";

interface CreateUserDialogProps {
  roles: RolePublic[];
}

const INITIAL_FORM = {
  first_name: "",
  last_name: "",
  username: "",
  email: "",
  password: "",
  position: GMS_POSITIONS[5].title, // Meteorological Observer — most common hire
  role: suggestedRoleForPosition(GMS_POSITIONS[5].title),
  department_id: "",
  employee_number: "",
};

export function CreateUserDialog({ roles }: CreateUserDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  const departmentsQuery = useListDepartmentsEndpointApiV1HrDepartmentsGet();
  const departments = departmentsQuery.data?.data ?? [];
  const departmentId = form.department_id || departments[0]?.id || "";

  const createUserMutation = useCreateUserApiV1AuthUsersPost();
  const assignRoleMutation =
    useCreateRoleAssignmentApiV1AuthRoleAssignmentsPost();
  const createEmploymentMutation =
    useCreateHrEmploymentApiV1HrEmploymentUserIdPost();

  const isPending =
    createUserMutation.isPending ||
    assignRoleMutation.isPending ||
    createEmploymentMutation.isPending;

  function set<K extends keyof typeof INITIAL_FORM>(
    key: K,
    value: (typeof INITIAL_FORM)[K]
  ) {
    setForm((cur) => ({ ...cur, [key]: value }));
  }

  function setPosition(position: string) {
    setForm((cur) => ({
      ...cur,
      position,
      role: suggestedRoleForPosition(position),
    }));
  }

  const canSubmit =
    form.first_name.trim() &&
    form.last_name.trim() &&
    form.username.trim() &&
    form.email.trim() &&
    form.password.length >= 8 &&
    form.employee_number.trim() &&
    departmentId;

  async function submit() {
    if (!canSubmit) return;
    try {
      const user = await createUserMutation.mutateAsync({
        data: {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
        },
      });

      const roleIdsByName = new Map(roles.map((r) => [r.name, r.id]));
      for (const roleName of rolesToAssign(form.role)) {
        const roleId = roleIdsByName.get(roleName);
        if (roleId) {
          await assignRoleMutation.mutateAsync({
            data: { user_id: user.id, role_id: roleId },
          });
        }
      }

      await createEmploymentMutation.mutateAsync({
        user_id: user.id,
        data: {
          employee_number: form.employee_number.trim(),
          department_id: departmentId,
          position: form.position,
        },
      });

      await invalidateAfterUserOnboard(queryClient, { departmentId });
      toast.success(
        `${form.first_name} ${form.last_name} onboarded as ${form.position}`
      );
      setForm(INITIAL_FORM);
      setOpen(false);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(`Onboarding failed: ${detail}`);
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" type="button" />}>
        <UserPlus data-icon="inline-start" />
        New user
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Onboard staff member</DialogTitle>
          <DialogDescription>
            Creates the account, assigns roles, and files the employment record.
            Share the temporary password with the person directly.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="cu-first">First name</FieldLabel>
              <Input
                id="cu-first"
                onChange={(e) => set("first_name", e.target.value)}
                value={form.first_name}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cu-last">Last name</FieldLabel>
              <Input
                id="cu-last"
                onChange={(e) => set("last_name", e.target.value)}
                value={form.last_name}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cu-username">Username</FieldLabel>
              <Input
                id="cu-username"
                onChange={(e) => set("username", e.target.value)}
                value={form.username}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cu-email">Email</FieldLabel>
              <Input
                id="cu-email"
                onChange={(e) => set("email", e.target.value)}
                type="email"
                value={form.email}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cu-password">Temporary password</FieldLabel>
              <Input
                id="cu-password"
                onChange={(e) => set("password", e.target.value)}
                type="text"
                value={form.password}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cu-empno">Employee number</FieldLabel>
              <Input
                id="cu-empno"
                onChange={(e) => set("employee_number", e.target.value)}
                value={form.employee_number}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cu-position">Position</FieldLabel>
              <NativeSelect
                id="cu-position"
                onChange={(e) => setPosition(e.target.value)}
                value={form.position}
              >
                {GMS_POSITIONS.map((p) => (
                  <option key={p.title} value={p.title}>
                    {p.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="cu-role">System role</FieldLabel>
              <NativeSelect
                id="cu-role"
                onChange={(e) => set("role", e.target.value)}
                value={form.role}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {departments.length > 1 ? (
              <Field>
                <FieldLabel htmlFor="cu-dept">Department</FieldLabel>
                <NativeSelect
                  id="cu-dept"
                  onChange={(e) => set("department_id", e.target.value)}
                  value={departmentId}
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
          </div>
        </FieldGroup>
        <DialogFooter>
          <Button
            onClick={() => setOpen(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || isPending}
            onClick={submit}
            type="button"
          >
            {isPending ? "Onboarding…" : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
