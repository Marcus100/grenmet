"use client";
import {
  type RoleConfiguration,
  readRoleConfigurationApiV1HrSetupRolesGet,
  readUsersApiV1AuthUsersGet,
  readWorkflowConfigurationApiV1HrSetupWorkflowsGet,
  saveWorkflowConfigurationApiV1HrSetupWorkflowsTemplateIdPut,
  type WorkflowConfigurationPublic,
  type WorkflowStepTemplateCreate,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

function WorkflowEditor({
  configuration,
  roles,
  people,
}: {
  configuration: WorkflowConfigurationPublic;
  roles: RoleConfiguration[];
  people: { id: string; full_name: string }[];
}) {
  const client = useQueryClient();
  const [name, setName] = useState(configuration.template.name);
  const [self, setSelf] = useState(configuration.allow_self_approval);
  const [distinct, setDistinct] = useState(
    configuration.require_distinct_approvers
  );
  const [steps, setSteps] = useState<
    (WorkflowStepTemplateCreate & { editorId: string })[]
  >(configuration.steps.map((step) => ({ ...step, editorId: step.id })));
  function edit(index: number, patch: Partial<WorkflowStepTemplateCreate>) {
    setSteps((current) =>
      current.map((step, i) => (i === index ? { ...step, ...patch } : step))
    );
  }
  function move(index: number, delta: number) {
    setSteps((current) => {
      const next = [...current];
      const other = index + delta;
      if (other < 0 || other >= next.length) return current;
      [next[index], next[other]] = [next[other], next[index]];
      return next;
    });
  }
  const save = useMutation({
    mutationFn: () =>
      saveWorkflowConfigurationApiV1HrSetupWorkflowsTemplateIdPut({
        path: { template_id: configuration.template.id },
        body: {
          name,
          allow_self_approval: self,
          require_distinct_approvers: distinct,
          steps: steps.map((step, index) => ({
            step_order: index + 1,
            required_role_id: step.required_role_id,
            required_user_id: step.required_user_id,
            required_scope: step.required_scope,
            is_required: step.is_required,
            purpose: step.purpose,
            label: step.label,
          })),
        },
      }).unwrap(),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["workflow-configuration"] }),
  });
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">
        {configuration.template.department_id} · {configuration.template.name}
      </summary>
      <div className="space-y-4 pt-4">
        <Input
          aria-label="Workflow name"
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
        <label className="flex gap-2">
          <input
            checked={self}
            onChange={(event) => setSelf(event.target.checked)}
            type="checkbox"
          />
          Allow self-approval
        </label>
        <label className="flex gap-2">
          <input
            checked={distinct}
            onChange={(event) => setDistinct(event.target.checked)}
            type="checkbox"
          />
          Require different people for approval and review stages
        </label>
        {steps.map((step, index) => (
          <fieldset
            className="space-y-3 rounded border p-3"
            key={step.editorId}
          >
            <legend>Stage {index + 1}</legend>
            <Input
              aria-label={`Stage ${index + 1} label`}
              onChange={(event) => edit(index, { label: event.target.value })}
              value={step.label ?? "Approval"}
            />
            <NativeSelect
              aria-label={`Stage ${index + 1} purpose`}
              onChange={(event) => {
                const purpose = event.target.value;
                if (
                  purpose === "APPROVAL" ||
                  purpose === "REVIEW" ||
                  purpose === "RECORDING"
                )
                  edit(index, { purpose });
              }}
              value={step.purpose ?? "APPROVAL"}
            >
              <option value="APPROVAL">Approval</option>
              <option value="REVIEW">Review</option>
              <option value="RECORDING">Recording</option>
            </NativeSelect>
            <NativeSelect
              aria-label={`Stage ${index + 1} assignee`}
              onChange={(event) => {
                const [kind, id] = event.target.value.split(":");
                edit(
                  index,
                  kind === "user"
                    ? { required_user_id: id, required_role_id: null }
                    : { required_role_id: id || null, required_user_id: null }
                );
              }}
              value={
                step.required_user_id
                  ? `user:${step.required_user_id}`
                  : `role:${step.required_role_id ?? ""}`
              }
            >
              <option value="role:">Choose a role or person</option>
              <optgroup label="Roles">
                {roles.map((role) => (
                  <option key={role.id} value={`role:${role.id}`}>
                    {role.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Named people">
                {people.map((person) => (
                  <option key={person.id} value={`user:${person.id}`}>
                    {person.full_name}
                  </option>
                ))}
              </optgroup>
            </NativeSelect>
            <NativeSelect
              aria-label={`Stage ${index + 1} scope`}
              onChange={(event) => {
                const scope = event.target.value;
                if (
                  scope === "SELF" ||
                  scope === "DEPARTMENT" ||
                  scope === "ALL"
                )
                  edit(index, { required_scope: scope });
              }}
              value={step.required_scope ?? "DEPARTMENT"}
            >
              <option value="DEPARTMENT">Department</option>
              <option value="SELF">Self</option>
              <option value="ALL">All departments</option>
            </NativeSelect>
            <label className="flex gap-2">
              <input
                checked={step.is_required ?? true}
                onChange={(event) =>
                  edit(index, { is_required: event.target.checked })
                }
                type="checkbox"
              />
              Blocks request completion
            </label>
            <div className="flex gap-2">
              <Button
                disabled={index === 0}
                onClick={() => move(index, -1)}
                variant="outline"
              >
                Move up
              </Button>
              <Button
                disabled={index === steps.length - 1}
                onClick={() => move(index, 1)}
                variant="outline"
              >
                Move down
              </Button>
              <Button
                onClick={() =>
                  setSteps((current) => current.filter((_, i) => i !== index))
                }
                variant="ghost"
              >
                Remove stage
              </Button>
            </div>
          </fieldset>
        ))}
        <Button
          onClick={() =>
            setSteps((current) => [
              ...current,
              {
                editorId: crypto.randomUUID(),
                step_order: current.length + 1,
                label: "HR recording",
                purpose: "RECORDING",
                required_role_id:
                  roles.find((role) => role.name === "hr-recorder")?.id ?? null,
                required_scope: "DEPARTMENT",
                is_required: false,
              },
            ])
          }
          variant="outline"
        >
          Add stage
        </Button>
        <p className="text-sm">
          Recording and non-blocking stages can be marked complete, but cannot
          reject a request. Saved rules apply to new workflow snapshots;
          existing requests retain their rules.
        </p>
        <Button
          disabled={save.isPending || !steps.length}
          onClick={() => save.mutate()}
        >
          Save workflow
        </Button>
        {save.isSuccess && (
          <p role="status">Workflow saved for future requests.</p>
        )}
        {save.isError && (
          <p role="alert">
            Unable to save. Choose an assignee for every stage and keep at least
            one blocking approval or review.
          </p>
        )}
      </div>
    </details>
  );
}
export function WorkflowPanel() {
  const configurations = useQuery({
    queryKey: ["workflow-configuration"],
    queryFn: () =>
      readWorkflowConfigurationApiV1HrSetupWorkflowsGet({}).unwrap(),
  });
  const roles = useQuery({
    queryKey: ["permission-bundles"],
    queryFn: () => readRoleConfigurationApiV1HrSetupRolesGet({}).unwrap(),
  });
  const people = useQuery({
    queryKey: ["workflow-people"],
    queryFn: async () => {
      const first = await readUsersApiV1AuthUsersGet({
        query: { page: 1, size: 100 },
      }).unwrap();
      const all = [...first.data];
      for (let page = 2; all.length < first.count; page++) {
        const next = await readUsersApiV1AuthUsersGet({
          query: { page, size: 100 },
        }).unwrap();
        if (!next.data.length) break;
        all.push(...next.data);
      }
      return all.filter((person) => person.is_active);
    },
  });
  if (configurations.isPending || roles.isPending || people.isPending)
    return <p>Loading workflows…</p>;
  if (configurations.isError || roles.isError || people.isError)
    return (
      <p role="alert">
        Unable to load workflow configuration. Administrator access is required.
      </p>
    );
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-xl">Workflow configuration</h2>
      <p>
        Configure each department and request type. Seniority and job titles
        never grant approval automatically.
      </p>
      {!configurations.data.length && (
        <p>
          No active workflows. Initialise the department approval catalogue in
          HR Setup first.
        </p>
      )}
      {configurations.data.map((configuration) => (
        <WorkflowEditor
          configuration={configuration}
          key={configuration.template.id}
          people={people.data}
          roles={roles.data}
        />
      ))}
    </section>
  );
}
