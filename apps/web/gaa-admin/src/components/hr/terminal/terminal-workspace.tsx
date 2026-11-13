"use client";

import {
  type TerminalAttentionOutcome,
  useAuthGetEffectiveAccess,
  useHrListDepartments,
} from "@barrelsgd/api-client";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import { reportError } from "@/lib/report-error";
import { TerminalAttention } from "./terminal-attention";
import { isAttentionOutcome } from "./terminal-format";
import { TerminalUpload } from "./terminal-upload";
import { TerminalUsers } from "./terminal-users";

const OFFSET = /^\d{1,6}$/u;

export function TerminalWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const accessQuery = useAuthGetEffectiveAccess();
  const departmentsQuery = useHrListDepartments();

  // Server-authoritative: every call re-checks roster.manage in the department.
  // This only hides a page that is certain to be refused.
  const canManage =
    accessQuery.isError ||
    accessQuery.data?.is_superuser === true ||
    accessQuery.data?.permission_keys.includes("roster.manage") === true;

  useEffect(() => {
    if (departmentsQuery.error)
      reportError(departmentsQuery.error, "hr-terminal-departments");
  }, [departmentsQuery.error]);

  const setParams = useCallback(
    (changes: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const query = next.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}` as Route, {
        scroll: false,
      });
    },
    [params, pathname, router]
  );

  const departments = departmentsQuery.data?.data ?? [];
  const requested = params.get("department") ?? "";
  const departmentId = departments.some((d) => d.id === requested)
    ? requested
    : (departments[0]?.id ?? "");
  const rawOutcome = params.get("outcome");
  const outcome: TerminalAttentionOutcome | undefined = isAttentionOutcome(
    rawOutcome
  )
    ? rawOutcome
    : undefined;
  const rawOffset = params.get("offset") ?? "";
  const offset = OFFSET.test(rawOffset) ? Number(rawOffset) : 0;

  const onOffsetChange = useCallback(
    (value: number) =>
      setParams({ offset: value > 0 ? String(value) : undefined }),
    [setParams]
  );
  const onOutcomeChange = useCallback(
    (value: TerminalAttentionOutcome | undefined) =>
      setParams({ outcome: value, offset: undefined }),
    [setParams]
  );

  if (accessQuery.isLoading || departmentsQuery.isLoading)
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Loading…
      </p>
    );
  if (!canManage)
    return (
      <p className="bg-card text-muted-foreground rounded-xl border p-4 text-sm">
        You do not manage terminal punches. Ask someone with roster management
        in your department to import them.
      </p>
    );
  if (departmentsQuery.isError)
    return (
      <p className="text-sm" role="alert">
        Unable to load departments. Refresh to retry.
      </p>
    );
  if (!departmentId)
    return (
      <p className="bg-card text-muted-foreground rounded-xl border p-4 text-sm">
        No departments yet. Add one in HR Setup first.
      </p>
    );

  return (
    <div className="space-y-8">
      <Field className="max-w-sm">
        <FieldLabel htmlFor="terminal-department">Department</FieldLabel>
        <NativeSelect
          id="terminal-department"
          onChange={(event) =>
            setParams({
              department: event.target.value,
              outcome: undefined,
              offset: undefined,
            })
          }
          value={departmentId}
        >
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <TerminalUpload departmentId={departmentId} key={`up-${departmentId}`} />
      <TerminalAttention
        departmentId={departmentId}
        offset={offset}
        onOffsetChange={onOffsetChange}
        onOutcomeChange={onOutcomeChange}
        outcome={outcome}
      />
      <TerminalUsers
        departmentId={departmentId}
        key={`users-${departmentId}`}
      />
    </div>
  );
}
