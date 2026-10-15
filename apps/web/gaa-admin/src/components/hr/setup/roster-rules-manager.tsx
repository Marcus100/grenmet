"use client";

import {
  hrGetDepartmentRulesQueryKey,
  useHrGetDepartmentRules,
  useHrListDepartments,
  useHrPutDepartmentRules,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/report-error";

interface RosterRulesManagerProps {
  canManage: boolean;
  organisationId?: string;
}

interface RuleFields {
  consecutive: string;
  rest: string;
  weekly: string;
}

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

function validate(fields: RuleFields): string | null {
  const rest = toNumber(fields.rest);
  const consecutive = toNumber(fields.consecutive);
  const weekly = toNumber(fields.weekly);
  if (rest !== null && !(rest >= 0 && rest <= 72)) {
    return "Minimum rest must be between 0 and 72 hours.";
  }
  if (
    consecutive !== null &&
    !(Number.isInteger(consecutive) && consecutive >= 1 && consecutive <= 31)
  ) {
    return "Maximum consecutive days must be a whole number from 1 to 31.";
  }
  if (weekly !== null && !(weekly > 0 && weekly <= 168)) {
    return "Maximum weekly hours must be above 0 and at most 168.";
  }
  return null;
}

function RulesForm({
  canManage,
  departmentId,
}: {
  canManage: boolean;
  departmentId: string;
}) {
  const queryClient = useQueryClient();
  const rulesQuery = useHrGetDepartmentRules({
    path: { department_id: departmentId },
  });
  const saveMutation = useHrPutDepartmentRules();
  const [edited, setEdited] = useState<RuleFields>();
  const saved: RuleFields = {
    rest: rulesQuery.data?.min_rest_hours?.toString() ?? "",
    consecutive: rulesQuery.data?.max_consecutive_days?.toString() ?? "",
    weekly: rulesQuery.data?.max_weekly_hours?.toString() ?? "",
  };
  const fields = edited ?? saved;
  const problem = validate(fields);

  useEffect(() => {
    if (rulesQuery.error) reportError(rulesQuery.error, "roster-rules-read");
  }, [rulesQuery.error]);

  if (rulesQuery.isPending) return <p role="status">Loading rules…</p>;
  if (rulesQuery.isError) {
    return <p role="alert">Unable to load roster rules. Refresh to retry.</p>;
  }

  async function save() {
    if (problem) return;
    try {
      await saveMutation.mutateAsync({
        path: { department_id: departmentId },
        body: {
          min_rest_hours: toNumber(fields.rest),
          max_consecutive_days: toNumber(fields.consecutive),
          max_weekly_hours: toNumber(fields.weekly),
        },
      });
      setEdited(undefined);
      // Roster warnings refetch on mount, so only the rules read is stale.
      await queryClient.invalidateQueries({
        queryKey: hrGetDepartmentRulesQueryKey({
          path: { department_id: departmentId },
        }),
      });
      toast.success("Roster rules saved");
    } catch (error) {
      reportError(error, "roster-rules-save");
      toast.error("Could not save roster rules");
    }
  }

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="rule-rest">Minimum rest (hours)</FieldLabel>
          <Input
            disabled={!canManage}
            id="rule-rest"
            inputMode="decimal"
            onChange={(event) =>
              setEdited({ ...fields, rest: event.target.value })
            }
            value={fields.rest}
          />
          <FieldDescription>
            Smallest gap allowed between the end of one shift and the start of
            the next.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="rule-consecutive">
            Maximum consecutive working days
          </FieldLabel>
          <Input
            disabled={!canManage}
            id="rule-consecutive"
            inputMode="numeric"
            onChange={(event) =>
              setEdited({ ...fields, consecutive: event.target.value })
            }
            value={fields.consecutive}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="rule-weekly">
            Maximum hours per week (Sunday to Saturday)
          </FieldLabel>
          <Input
            disabled={!canManage}
            id="rule-weekly"
            inputMode="decimal"
            onChange={(event) =>
              setEdited({ ...fields, weekly: event.target.value })
            }
            value={fields.weekly}
          />
        </Field>
      </FieldGroup>
      <p className="text-muted-foreground text-xs">
        Leave a field empty to switch that rule off. Rules only show warnings on
        the duty roster; they never block saving or publishing. Enter limits
        only after HR has confirmed them.
      </p>
      {problem ? (
        <p className="text-destructive text-sm" role="alert">
          {problem}
        </p>
      ) : null}
      {canManage ? (
        <div className="flex gap-2">
          <Button
            disabled={!edited || Boolean(problem) || saveMutation.isPending}
            type="submit"
          >
            Save rules
          </Button>
          <Button
            disabled={!edited}
            onClick={() => setEdited(undefined)}
            type="button"
            variant="outline"
          >
            Discard
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          You can view these limits but not change them.
        </p>
      )}
    </form>
  );
}

export function RosterRulesManager({
  organisationId,
  canManage,
}: RosterRulesManagerProps) {
  const departmentsQuery = useHrListDepartments({
    query: { organisation_id: organisationId },
  });
  const departments = departmentsQuery.data?.data ?? [];
  const [selected, setSelected] = useState("");
  const departmentId = selected || departments[0]?.id || "";

  if (departmentsQuery.isPending) return <p role="status">Loading…</p>;
  if (departments.length === 0) {
    return <p>No departments exist for this organisation yet.</p>;
  }

  return (
    <div className="space-y-4">
      <NativeSelect
        aria-label="Department"
        onChange={(event) => setSelected(event.target.value)}
        value={departmentId}
      >
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </NativeSelect>
      <RulesForm
        canManage={canManage}
        departmentId={departmentId}
        key={departmentId}
      />
    </div>
  );
}
