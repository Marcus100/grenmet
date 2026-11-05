"use client";

import {
  hrGetDepartmentRuleSetQueryKey,
  hrGetOrganisationRuleSetQueryKey,
  hrListRuleProfilesQueryKey,
  type RosterRuleSetUpdate,
  type RuleSetSource,
  useHrDeleteDepartmentRuleSet,
  useHrGetDepartmentRuleSet,
  useHrGetOrganisationRuleSet,
  useHrListDepartments,
  useHrListRuleOverrides,
  useHrListRuleProfiles,
  useHrPutDepartmentRuleSet,
  useHrPutOrganisationRuleSet,
  useHrPutRuleProfile,
  type WorkerType,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/report-error";
import { hrApiErrorMessage } from "../api-error";
import { ruleTitle } from "../roster/rule-codes";
import { RuleSetForm, valuesFrom } from "./rule-set-form";

interface RosterRulesManagerProps {
  /** roster.rules.manage in some scope: may change department rules and coverage. */
  canEditDepartment: boolean;
  /** Organisation-wide roster.rules.manage: may change the organisation default. */
  canEditOrganisation: boolean;
  organisationId?: string;
}

// Every department's rule-set query starts with this; invalidating it refreshes
// departments that follow the organisation default.
const DEPARTMENT_RULE_SET_URL =
  "/api/v1/hr/rosters/departments/:department_id/rule-set";

const SOURCE_LABEL: Record<RuleSetSource, string> = {
  DEFAULT: "Built-in defaults",
  ORGANISATION: "Organisation rules",
  DEPARTMENT: "This department's own rules",
};

const CONTEXT_LABEL: Record<string, string> = {
  PUBLISH: "Roster published",
  ROSTER_CHANGE: "Published roster changed",
  SHIFT_SWAP: "Shift exchange approved",
  LEAVE: "Leave cancelled",
  ABSENCE: "Absence cancelled",
  TIMESHEET: "Timesheet approved",
  ATTENDANCE: "Attendance approved",
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}

function failed(error: unknown, area: string, message: string) {
  reportError(error, area);
  toast.error(`${message}: ${hrApiErrorMessage(error)}`);
}

function OrganisationRules({
  organisationId,
  canEdit,
}: {
  organisationId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const query = useHrGetOrganisationRuleSet(
    { path: { organisation_id: organisationId } },
    { query: { enabled: canEdit } }
  );
  const save = useHrPutOrganisationRuleSet();
  if (!canEdit) {
    return (
      <p className="text-muted-foreground text-sm">
        Only an organisation-wide HR administrator can change the organisation
        default. Each department below shows the rules that apply to it.
      </p>
    );
  }
  if (query.isPending) return <p role="status">Loading rules…</p>;
  if (query.isError) {
    return <p role="alert">Unable to load the organisation rules.</p>;
  }
  async function onSave(body: RosterRuleSetUpdate) {
    try {
      await save.mutateAsync({
        path: { organisation_id: organisationId },
        body,
      });
      await queryClient.invalidateQueries({
        queryKey: hrGetOrganisationRuleSetQueryKey({
          path: { organisation_id: organisationId },
        }),
      });
      // Departments without their own rules follow the organisation.
      await queryClient.invalidateQueries({
        queryKey: [{ url: DEPARTMENT_RULE_SET_URL }],
      });
      toast.success("Organisation roster rules saved");
    } catch (error) {
      failed(error, "roster-rules-org-save", "Could not save");
    }
  }
  return (
    <div className="space-y-2">
      <Badge variant="outline">{SOURCE_LABEL[query.data.source]}</Badge>
      <RuleSetForm
        canEdit
        idPrefix="org"
        initial={valuesFrom(query.data)}
        key={query.data.updated_at ?? "default"}
        onSave={onSave}
        saveLabel="Save organisation rules"
        saving={save.isPending}
      />
    </div>
  );
}

function DepartmentRules({
  departmentId,
  canEdit,
}: {
  departmentId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const key = hrGetDepartmentRuleSetQueryKey({
    path: { department_id: departmentId },
  });
  const query = useHrGetDepartmentRuleSet({
    path: { department_id: departmentId },
  });
  const save = useHrPutDepartmentRuleSet();
  const clear = useHrDeleteDepartmentRuleSet();
  if (query.isPending) return <p role="status">Loading rules…</p>;
  if (query.isError) {
    return <p role="alert">Unable to load this department's rules.</p>;
  }
  const own = query.data.source === "DEPARTMENT";
  async function onSave(body: RosterRuleSetUpdate) {
    try {
      await save.mutateAsync({ path: { department_id: departmentId }, body });
      await queryClient.invalidateQueries({ queryKey: key });
      toast.success("Department roster rules saved");
    } catch (error) {
      failed(error, "roster-rules-department-save", "Could not save");
    }
  }
  async function onClear() {
    try {
      await clear.mutateAsync({ path: { department_id: departmentId } });
      await queryClient.invalidateQueries({ queryKey: key });
      toast.success("This department now follows the organisation rules");
    } catch (error) {
      failed(error, "roster-rules-department-clear", "Could not change");
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={own ? "secondary" : "outline"}>
          {SOURCE_LABEL[query.data.source]}
        </Badge>
        {canEdit ? (
          <Button
            disabled={!own || clear.isPending}
            onClick={onClear}
            size="sm"
            type="button"
            variant="outline"
          >
            Use the organisation rules
          </Button>
        ) : null}
      </div>
      <RuleSetForm
        canEdit={canEdit}
        idPrefix={`dept-${departmentId}`}
        initial={valuesFrom(query.data)}
        key={`${query.data.source}-${query.data.updated_at ?? ""}`}
        onSave={onSave}
        saveLabel={
          own ? "Save department rules" : "Give this department its own rules"
        }
        saving={save.isPending}
      />
      {canEdit ? null : (
        <p className="text-muted-foreground text-xs">
          You can view these rules but not change them.
        </p>
      )}
    </div>
  );
}

function Coverage({ departmentId }: { departmentId: string }) {
  const queryClient = useQueryClient();
  const query = useHrListRuleProfiles({
    path: { department_id: departmentId },
  });
  const save = useHrPutRuleProfile();
  if (query.isPending) return <p role="status">Loading staff…</p>;
  if (query.isError) {
    return <p role="alert">Unable to load staff coverage.</p>;
  }
  const rows = query.data.data;
  async function update(
    userId: string,
    unionCovered: boolean,
    workerType: WorkerType | null
  ) {
    try {
      await save.mutateAsync({
        path: { user_id: userId },
        body: { union_covered: unionCovered, worker_type: workerType },
      });
      await queryClient.invalidateQueries({
        queryKey: hrListRuleProfilesQueryKey({
          path: { department_id: departmentId },
        }),
      });
      toast.success("Coverage saved");
    } catch (error) {
      failed(error, "roster-rules-coverage", "Could not save coverage");
    }
  }
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No staff are recorded in this department yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff member</TableHead>
            <TableHead>Covered by the union agreement</TableHead>
            <TableHead>Worker type</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.user_id}>
              <TableCell>
                {row.full_name}
                {row.employee_number ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {row.employee_number}
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                <Checkbox
                  aria-label={`${row.full_name} covered by the union agreement`}
                  checked={row.union_covered}
                  disabled={save.isPending}
                  onCheckedChange={(checked) =>
                    update(
                      row.user_id,
                      checked === true,
                      row.worker_type ?? null
                    )
                  }
                />
              </TableCell>
              <TableCell>
                <NativeSelect
                  aria-label={`${row.full_name} worker type`}
                  disabled={save.isPending}
                  onChange={(event) =>
                    update(
                      row.user_id,
                      row.union_covered,
                      event.target.value === ""
                        ? null
                        : (event.target.value as WorkerType)
                    )
                  }
                  value={row.worker_type ?? ""}
                >
                  <option value="">Department default</option>
                  <option value="SHIFT">Shift worker</option>
                  <option value="NON_SHIFT">Non-shift</option>
                </NativeSelect>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Overrides({ departmentId }: { departmentId: string }) {
  const query = useHrListRuleOverrides({
    path: { department_id: departmentId },
  });
  if (query.isPending) return <p role="status">Loading overrides…</p>;
  if (query.isError) {
    return (
      <p className="text-muted-foreground text-sm">
        You cannot see the overrides for this department.
      </p>
    );
  }
  const rows = query.data.data;
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No changes have been saved despite rule warnings.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Who</TableHead>
            <TableHead>What</TableHead>
            <TableHead>Rules</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">
                {new Date(row.created_at).toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "America/Grenada",
                })}
              </TableCell>
              <TableCell>{row.overridden_by_name}</TableCell>
              <TableCell>{CONTEXT_LABEL[row.context] ?? row.context}</TableCell>
              <TableCell>{row.rule_codes.map(ruleTitle).join(", ")}</TableCell>
              <TableCell className="max-w-80 whitespace-normal">
                {row.reason}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function RosterRulesManager({
  organisationId,
  canEditOrganisation,
  canEditDepartment,
}: RosterRulesManagerProps) {
  const departmentsQuery = useHrListDepartments({
    query: { organisation_id: organisationId },
  });
  const departments = departmentsQuery.data?.data ?? [];
  const [selected, setSelected] = useState("");
  const departmentId = selected || departments[0]?.id || "";

  return (
    <div className="space-y-4">
      <Section
        description="Every department uses these unless it has its own rules. All rules are on by default."
        title="Organisation default"
      >
        {organisationId ? (
          <OrganisationRules
            canEdit={canEditOrganisation}
            organisationId={organisationId}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            Select an organisation first.
          </p>
        )}
      </Section>
      <Section
        description="The rules that apply to one department's roster."
        title="Department rules"
      >
        {departmentsQuery.isPending ? <p role="status">Loading…</p> : null}
        {!departmentsQuery.isPending && departments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No departments exist for this organisation yet.
          </p>
        ) : null}
        {departments.length > 0 ? (
          <>
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
            <DepartmentRules
              canEdit={canEditDepartment}
              departmentId={departmentId}
              key={departmentId}
            />
          </>
        ) : null}
      </Section>
      <Section
        description="Staff not covered by the union agreement (for example management) are not checked. A worker type here overrides the department's."
        title="Union coverage"
      >
        {departmentId && canEditDepartment ? (
          <Coverage departmentId={departmentId} key={departmentId} />
        ) : (
          <p className="text-muted-foreground text-sm">
            {departmentId
              ? "Only HR administrators can view and change coverage."
              : "Select a department."}
          </p>
        )}
      </Section>
      <Section
        description="Changes saved despite roster rule warnings: who, when, which rules and why."
        title="Saved despite warnings"
      >
        {departmentId ? (
          <Overrides departmentId={departmentId} key={departmentId} />
        ) : (
          <p className="text-muted-foreground text-sm">Select a department.</p>
        )}
      </Section>
    </div>
  );
}
