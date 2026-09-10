"use client";
import {
  importOrganisationApiV1HrSetupOrganisationPost,
  previewOrganisationApiV1HrSetupOrganisationGet,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function OrganisationPanel() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["gaa-organisation"],
    queryFn: () => previewOrganisationApiV1HrSetupOrganisationGet({}).unwrap(),
  });
  const save = useMutation({
    mutationFn: () =>
      importOrganisationApiV1HrSetupOrganisationPost({}).unwrap(),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["gaa-organisation"] }),
  });
  if (query.isPending) return <p>Loading GAA structure…</p>;
  if (query.isError)
    return (
      <p role="alert">
        Unable to load the organisation preview. Administrator access is
        required.
      </p>
    );
  const data = {
    ...query.data,
    missing_departments: query.data.missing_departments ?? [],
    missing_units: query.data.missing_units ?? [],
    missing_positions: query.data.missing_positions ?? [],
    conflicts: query.data.conflicts ?? [],
    gms_differences: query.data.gms_differences ?? [],
  };
  const missing =
    data.missing_departments.length +
    data.missing_units.length +
    data.missing_positions.length;
  return (
    <section className="space-y-4">
      <h2 className="font-semibold text-xl">GAA organisation</h2>
      <p>
        May 2026 establishment: {data.catalogue.units.length} units and{" "}
        {data.catalogue.positions.length} position types. GMS staff and roster
        remain authoritative for launch.
      </p>
      <p>
        Missing: {data.missing_departments.length} departments,{" "}
        {data.missing_units.length} units, {data.missing_positions.length}{" "}
        positions.
      </p>
      <Button
        disabled={!missing || !!data.conflicts.length || save.isPending}
        onClick={() => save.mutate()}
      >
        Import missing structure
      </Button>
      {save.isSuccess && (
        <p role="status">
          Structure imported. Staff and access were preserved.
        </p>
      )}
      {save.isError && (
        <p role="alert">
          Import failed. Refresh the preview and resolve conflicts before
          retrying.
        </p>
      )}
      {[...data.conflicts, ...data.gms_differences].map((text) => (
        <p key={text} role="alert">
          {text}
        </p>
      ))}
      <details>
        <summary>Source notes and unresolved details</summary>
        <ul className="list-disc space-y-1 ps-5">
          {data.catalogue.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </details>
      {data.catalogue.units.map((unit) => (
        <details className="rounded-lg border p-4" key={unit.id}>
          <summary className="cursor-pointer font-medium">{unit.name}</summary>
          <p className="py-2 text-muted-foreground text-sm">
            Reports within:{" "}
            {data.catalogue.units.find((parent) => parent.id === unit.parent_id)
              ?.name ?? "Board of Directors"}
            . Source slide {unit.source_slide}.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Position</th>
                  <th className="p-2">Reports to</th>
                  <th className="p-2">Posts</th>
                  <th className="p-2">Reported vacancies</th>
                  <th className="p-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.catalogue.positions
                  .filter((p) => p.unit_id === unit.id)
                  .map((position) => (
                    <tr className="border-t" key={position.id}>
                      <td className="p-2">{position.title}</td>
                      <td className="p-2">
                        {data.catalogue.positions.find(
                          (parent) =>
                            parent.id === position.reports_to_position_id
                        )?.title ?? "Board of Directors"}
                        {position.additional_connection_id && (
                          <span className="block text-muted-foreground">
                            Additional connection:{" "}
                            {
                              data.catalogue.positions.find(
                                (parent) =>
                                  parent.id ===
                                  position.additional_connection_id
                              )?.title
                            }{" "}
                            (unconfirmed)
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        {position.authorised_posts ?? "Unconfirmed"}
                      </td>
                      <td className="p-2">
                        {position.reported_vacancies ?? "Not stated"}
                      </td>
                      <td className="p-2">{position.notes}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </section>
  );
}
