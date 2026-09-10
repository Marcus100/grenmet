"use client";

import {
  readDocumentEmployeesApiV1HrDocumentEmployeesGet,
  readOrganisationsApiV1HrOrganisationsGet,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { EmployeeDocuments } from "@/components/hr/documents/employee-documents";

export function DocumentWorkspace() {
  const id = useId();
  const [selectedOrganisation, setSelectedOrganisation] = useState("");
  const organisations = useQuery({
    queryKey: ["hr-organisations"],
    queryFn: () => readOrganisationsApiV1HrOrganisationsGet().unwrap(),
  });
  const organisationId =
    selectedOrganisation ||
    (organisations.data?.length === 1 ? organisations.data[0]?.id : undefined);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(
    null
  );
  const query = useQuery({
    queryKey: ["document-employees", organisationId, search, page],
    enabled: Boolean(organisationId),
    queryFn: () =>
      readDocumentEmployeesApiV1HrDocumentEmployeesGet({
        query: { search, page, size: 20, organisation_id: organisationId },
      }).unwrap(),
  });
  return (
    <div className="space-y-6">
      {organisations.isError && (
        <p role="alert">Unable to load organisations.</p>
      )}
      {organisations.isPending && <p role="status">Loading organisations…</p>}
      {organisations.data && organisations.data.length > 1 && (
        <div className="space-y-2">
          <Label htmlFor={`${id}-organisation`}>Organisation</Label>
          <select
            className="rounded-md border border-input bg-background p-2 text-sm"
            id={`${id}-organisation`}
            onChange={(event) => {
              setSelectedOrganisation(event.target.value);
              setPage(1);
              setSelected(null);
            }}
            value={selectedOrganisation}
          >
            <option value="">Select an organisation</option>
            {organisations.data.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(
            String(new FormData(event.currentTarget).get("search") ?? "").trim()
          );
          setPage(1);
          setSelected(null);
        }}
      >
        <div className="space-y-2">
          <Label htmlFor={`${id}-search`}>Find an employee</Label>
          <Input
            id={`${id}-search`}
            maxLength={100}
            name="search"
            placeholder="Search by name"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>
      {query.isFetching && <p role="status">Loading employees…</p>}
      {query.isError && (
        <div role="alert">
          <p>Unable to load employees.</p>
          <Button onClick={() => query.refetch()} variant="outline">
            Retry
          </Button>
        </div>
      )}
      {query.isSuccess && (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Only employees within your document access are listed.
          </p>
          {!query.data.data.length && <p>No matching employees.</p>}
          <ul className="flex flex-wrap gap-2">
            {query.data.data.map((employee) => (
              <li key={employee.user_id}>
                <Button
                  aria-pressed={selected?.id === employee.user_id}
                  onClick={() =>
                    setSelected({ id: employee.user_id, name: employee.name })
                  }
                  variant="outline"
                >
                  {employee.name} · {employee.department_id}
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <Button
              disabled={page <= 1}
              onClick={() => {
                setPage(page - 1);
                setSelected(null);
              }}
              variant="outline"
            >
              Previous employees
            </Button>
            <span className="text-sm">
              Page {page} of {Math.max(1, Math.ceil(query.data.count / 20))}
            </span>
            <Button
              disabled={page * 20 >= query.data.count}
              onClick={() => {
                setPage(page + 1);
                setSelected(null);
              }}
              variant="outline"
            >
              Next employees
            </Button>
          </div>
        </div>
      )}
      {selected && (
        <div className="space-y-4">
          <h2 className="font-medium text-xl">{selected.name}</h2>
          <EmployeeDocuments
            key={`${organisationId}-${selected.id}`}
            organisationId={organisationId}
            userId={selected.id}
          />
        </div>
      )}
    </div>
  );
}
