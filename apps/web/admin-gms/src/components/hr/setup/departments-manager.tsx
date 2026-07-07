"use client";

import {
  type DepartmentPublic,
  listDepartmentsEndpointApiV1HrDepartmentsGetQueryKey,
  useCreateDepartmentEndpointApiV1HrDepartmentsPost,
  useListDepartmentsEndpointApiV1HrDepartmentsGet,
  useUpdateDepartmentEndpointApiV1HrDepartmentsDepartmentIdPatch,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@grenmet/ui/components/ui/table";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const NON_SLUG = /[^a-z0-9]+/g;
const EDGE_UNDERSCORES = /^_+|_+$/g;

// A department id is a short, permanent code. Suggest one from the name so the
// user rarely has to think about it, but keep it editable before creation.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(NON_SLUG, "_")
    .replace(EDGE_UNDERSCORES, "");
}

function DepartmentDialog({
  existing,
  trigger,
}: {
  existing?: DepartmentPublic;
  trigger: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(existing?.name ?? "");
  const [id, setId] = useState(existing?.id ?? "");
  const [idTouched, setIdTouched] = useState(false);

  const createMutation = useCreateDepartmentEndpointApiV1HrDepartmentsPost();
  const updateMutation =
    useUpdateDepartmentEndpointApiV1HrDepartmentsDepartmentIdPatch();
  const isPending = createMutation.isPending || updateMutation.isPending;
  const isEdit = Boolean(existing);

  function reset() {
    setName(existing?.name ?? "");
    setId(existing?.id ?? "");
    setIdTouched(false);
  }

  function onNameChange(value: string) {
    setName(value);
    if (!(isEdit || idTouched)) {
      setId(slugify(value));
    }
  }

  const canSubmit = name.trim() && (isEdit || id.trim());

  async function submit() {
    if (!canSubmit) {
      return;
    }
    try {
      if (existing) {
        await updateMutation.mutateAsync({
          department_id: existing.id,
          data: { name: name.trim() },
        });
      } else {
        await createMutation.mutateAsync({
          data: { id: id.trim(), name: name.trim() },
        });
      }
      await queryClient.invalidateQueries({
        queryKey: listDepartmentsEndpointApiV1HrDepartmentsGetQueryKey(),
      });
      toast.success(isEdit ? `Renamed to "${name}"` : `Created "${name}"`);
      setOpen(false);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(`Could not save department: ${detail}`);
    }
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          reset();
        }
      }}
      open={open}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Rename ${existing?.name}` : "New department"}
          </DialogTitle>
          <DialogDescription>
            Departments group staff for rostering (e.g. Meteorological
            Department).
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="dept-name">Name</FieldLabel>
            <Input
              id="dept-name"
              maxLength={255}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Meteorological Department"
              value={name}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="dept-id">Short ID</FieldLabel>
            <Input
              disabled={isEdit}
              id="dept-id"
              maxLength={100}
              onChange={(e) => {
                setIdTouched(true);
                setId(slugify(e.target.value));
              }}
              placeholder="meteorological_department"
              value={id}
            />
          </Field>
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
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DepartmentsManager() {
  const departmentsQuery = useListDepartmentsEndpointApiV1HrDepartmentsGet();
  const departments = departmentsQuery.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DepartmentDialog
          trigger={
            <Button size="sm" type="button">
              <Plus data-icon="inline-start" />
              New department
            </Button>
          }
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Short ID</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {departments.length === 0 ? (
            <TableRow>
              <TableCell
                className="text-center text-muted-foreground text-sm"
                colSpan={3}
              >
                {departmentsQuery.isLoading
                  ? "Loading…"
                  : "No departments yet — add one to group staff for rostering."}
              </TableCell>
            </TableRow>
          ) : (
            departments.map((dept) => (
              <TableRow key={dept.id}>
                <TableCell className="font-medium">{dept.name}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {dept.id}
                </TableCell>
                <TableCell className="text-right">
                  <DepartmentDialog
                    existing={dept}
                    trigger={
                      <Button size="sm" type="button" variant="ghost">
                        <Pencil className="size-3.5" />
                        Rename
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
