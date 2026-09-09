"use client";
import type { CataloguePreview } from "@barrelsgd/api-client";
import { useListDepartmentsEndpointApiV1HrDepartmentsGet } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { importCatalogue, previewCatalogue } from "./setup-api";

export function CatalogueSetup({ onSaved }: { onSaved: () => void }) {
  const id = useId();
  const departmentsQuery = useListDepartmentsEndpointApiV1HrDepartmentsGet();
  const departments = departmentsQuery.data?.data ?? [];
  const previewMutation = useMutation({ mutationFn: previewCatalogue });
  const importMutation = useMutation({ mutationFn: importCatalogue });
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<CataloguePreview | null>(null);
  const busy = previewMutation.isPending || importMutation.isPending;
  const [message, setMessage] = useState("");
  async function run(apply: boolean) {
    setMessage("");
    try {
      const result = await (apply
        ? importMutation.mutateAsync(selected)
        : previewMutation.mutateAsync(selected));
      setPreview(result);
      if (apply) {
        setMessage(
          "Missing reference data imported. Existing records were preserved."
        );
        onSaved();
      }
    } catch (error) {
      setPreview(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to check reference data"
      );
    }
  }
  return (
    <section
      aria-label="Reference data setup"
      className="space-y-3 rounded-lg border p-4"
    >
      <h2 className="font-semibold">Reference data setup</h2>
      <p>
        Preview the ingested GMS grades and standard approval setup missing from
        an existing department. Import adds missing records only. It does not
        create staff, assign roles, or change existing records. New approval
        policies prevent self-approval and require different HR approvers.
      </p>
      {departmentsQuery.isError && (
        <p role="alert">Unable to load departments. Refresh to retry.</p>
      )}
      <label htmlFor={id}>Department</label>
      <select
        className="block w-full rounded border bg-background p-2"
        disabled={busy}
        id={id}
        onChange={(event) => {
          setSelected(event.target.value);
          setPreview(null);
          setMessage("");
        }}
        value={selected}
      >
        <option value="">Choose a department</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </select>
      <Button disabled={busy || !selected} onClick={() => run(false)}>
        Preview missing setup
      </Button>
      {preview && (
        <div className="space-y-2">
          <p>
            Missing grades: {preview.missing_grade_ids.length}. Missing
            policies: {preview.missing_policy_keys.length}. Missing workflows:{" "}
            {preview.missing_workflow_types.length}.
          </p>
          <ul>
            {[
              ...preview.missing_grade_ids,
              ...preview.missing_policy_keys,
              ...preview.missing_workflow_types,
            ].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {preview.conflicts.map((conflict) => (
            <p key={conflict} role="alert">
              {conflict}
            </p>
          ))}
          <Button
            disabled={
              busy ||
              preview.conflicts.length > 0 ||
              !(
                preview.missing_grade_ids.length +
                preview.missing_policy_keys.length +
                preview.missing_workflow_types.length
              )
            }
            onClick={() => run(true)}
          >
            Import missing setup
          </Button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
