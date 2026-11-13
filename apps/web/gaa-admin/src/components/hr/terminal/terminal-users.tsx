"use client";

import {
  type TerminalUserPublic,
  useHrAddTerminalUser,
  useHrListDepartmentMembers,
  useHrListTerminalUsers,
  useHrRemoveTerminalUser,
} from "@barrelsgd/api-client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@barrelsgd/ui/components/ui/alert-dialog";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { Skeleton } from "@barrelsgd/ui/components/ui/skeleton";
import { Spinner } from "@barrelsgd/ui/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { useQueryClient } from "@tanstack/react-query";
import { Link2, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { rosterLabel } from "@/lib/people";
import { reportError } from "@/lib/report-error";
import { hrApiErrorMessage } from "../api-error";
import { errorStatus, invalidateAfterTerminalChange } from "./terminal-format";

const DEVICE_ID = /^\S{1,32}$/u;
const EXPECTED_STATUSES = [400, 403, 404, 409, 422];

function addError(error: unknown): string {
  const status = errorStatus(error);
  if (status === 403)
    return "You cannot link device IDs for this person. You need roster management in the department and permission to record attendance on their behalf.";
  if (status === 400 || status === 409 || status === 422)
    return hrApiErrorMessage(error);
  return "The device ID was not linked. Try again.";
}

function AddMapping({ departmentId }: { departmentId: string }) {
  const queryClient = useQueryClient();
  const membersQuery = useHrListDepartmentMembers({
    path: { department_id: departmentId },
  });
  const add = useHrAddTerminalUser();
  const [deviceId, setDeviceId] = useState("");
  const [userId, setUserId] = useState("");
  const [problem, setProblem] = useState<string>();
  const members = membersQuery.data?.data ?? [];

  useEffect(() => {
    if (membersQuery.error)
      reportError(membersQuery.error, "hr-terminal-members");
  }, [membersQuery.error]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = deviceId.trim();
    if (!DEVICE_ID.test(trimmed)) {
      setProblem(
        "Enter the user ID shown on the terminal: up to 32 characters, no spaces."
      );
      return;
    }
    if (!userId) {
      setProblem("Choose the employee this device ID belongs to.");
      return;
    }
    setProblem(undefined);
    try {
      const created = await add.mutateAsync({
        body: {
          department_id: departmentId,
          device_user_id: trimmed,
          user_id: userId,
        },
      });
      toast.success(
        `Linked device ID ${created.device_user_id} to ${created.employee_name}. Press Decide again to place their held punches.`
      );
      setDeviceId("");
      setUserId("");
      await invalidateAfterTerminalChange(queryClient);
    } catch (error) {
      if (!EXPECTED_STATUSES.includes(errorStatus(error) ?? 0))
        reportError(error, "hr-terminal-add-user");
      setProblem(addError(error));
    }
  }

  return (
    <form
      aria-label="Link a device ID"
      className="bg-card grid max-w-3xl gap-4 rounded-xl border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      noValidate
      onSubmit={submit}
    >
      <Field>
        <FieldLabel htmlFor="terminal-device-id">Device user ID</FieldLabel>
        <Input
          autoComplete="off"
          className="font-mono"
          id="terminal-device-id"
          maxLength={32}
          onChange={(event) => setDeviceId(event.target.value)}
          value={deviceId}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="terminal-employee">Employee</FieldLabel>
        <NativeSelect
          disabled={membersQuery.isLoading}
          id="terminal-employee"
          onChange={(event) => setUserId(event.target.value)}
          value={userId}
        >
          <option value="">
            {membersQuery.isLoading ? "Loading staff…" : "Choose an employee"}
          </option>
          {members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {rosterLabel(member)} ({member.full_name})
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Button disabled={add.isPending} type="submit">
        {add.isPending ? (
          <Spinner className="size-4" data-icon="inline-start" />
        ) : (
          <Link2 data-icon="inline-start" />
        )}
        Link
      </Button>
      {problem ? (
        <p className="text-destructive text-sm sm:col-span-3" role="alert">
          {problem}
        </p>
      ) : null}
      {membersQuery.isError ? (
        <FieldDescription className="sm:col-span-3">
          Unable to load the department&apos;s staff. Refresh to retry.
        </FieldDescription>
      ) : null}
    </form>
  );
}

export function TerminalUsers({ departmentId }: { departmentId: string }) {
  const queryClient = useQueryClient();
  const listQuery = useHrListTerminalUsers({
    query: { department_id: departmentId },
  });
  const remove = useHrRemoveTerminalUser();
  const [removing, setRemoving] = useState<TerminalUserPublic>();

  useEffect(() => {
    if (listQuery.error && errorStatus(listQuery.error) !== 403)
      reportError(listQuery.error, "hr-terminal-users");
  }, [listQuery.error]);

  async function confirmRemove() {
    if (!removing) return;
    const mapping = removing;
    try {
      await remove.mutateAsync({
        path: { terminal_user_id: mapping.id },
      });
      toast.success(
        `Removed device ID ${mapping.device_user_id} from ${mapping.employee_name}`
      );
    } catch (error) {
      if (errorStatus(error) !== 404)
        reportError(error, "hr-terminal-remove-user");
      toast.error(
        errorStatus(error) === 404
          ? "This link no longer exists. The list has been refreshed."
          : "The link was not removed. Try again."
      );
    } finally {
      setRemoving(undefined);
      await invalidateAfterTerminalChange(queryClient);
    }
  }

  const mappings = listQuery.data?.data ?? [];
  let table: ReactNode;
  if (listQuery.isError) {
    table = (
      <p className="text-sm" role="alert">
        {errorStatus(listQuery.error) === 403
          ? "You cannot see terminal users for this department. You need roster management in it."
          : "Unable to load terminal users. Refresh to retry."}
      </p>
    );
  } else {
    table = (
      <div className="bg-card rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device user ID</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading
              ? [0, 1].map((row) => (
                  <TableRow key={row}>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))
              : null}
            {!listQuery.isLoading && mappings.length === 0 ? (
              <TableRow>
                <TableCell
                  className="text-muted-foreground py-6 text-center"
                  colSpan={3}
                >
                  No device IDs linked yet. Link each person&apos;s terminal
                  user ID above so their scans count as attendance.
                </TableCell>
              </TableRow>
            ) : null}
            {mappings.map((mapping) => (
              <TableRow key={mapping.id}>
                <TableCell className="font-mono">
                  {mapping.device_user_id}
                </TableCell>
                <TableCell className="break-words">
                  {mapping.employee_name}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    aria-label={`Remove device ID ${mapping.device_user_id} from ${mapping.employee_name}`}
                    onClick={() => setRemoving(mapping)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <section aria-labelledby="terminal-users-heading" className="space-y-3">
      <div>
        <h2
          className="text-lg font-semibold tracking-tight"
          id="terminal-users-heading"
        >
          Terminal users
        </h2>
        <p className="text-muted-foreground text-sm">
          Link the user ID each person has on the terminal to their staff
          record. Only the ID is stored, never fingerprints. One ID per person
          in this department.
        </p>
      </div>
      <AddMapping departmentId={departmentId} />
      {table}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setRemoving(undefined);
        }}
        open={Boolean(removing)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {removing
              ? `Remove device ID ${removing.device_user_id} from ${removing.employee_name}?`
              : "Remove this link?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Punches already recorded stay recorded. New scans with this ID will
            wait as “Unknown device ID” until it is linked again.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              disabled={remove.isPending}
              onClick={confirmRemove}
              type="button"
              variant="destructive"
            >
              Remove link
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
