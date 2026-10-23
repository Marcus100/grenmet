"use client";
"use no memo";

import {
  useAuthGetRoleAssignments,
  useAuthGetRoles,
} from "@barrelsgd/api-client";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@barrelsgd/ui/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barrelsgd/ui/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsTrigger,
} from "@barrelsgd/ui/components/ui/tabs";
import type {
  ColumnFiltersState,
  ColumnVisibilityState,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useLegacyTable,
} from "@tanstack/react-table/legacy";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageTabsList } from "@/components/layout/page-tabs";
import { AccessReviewsPanel } from "./access-reviews-panel";
import { OrganisationPanel } from "./organisation-panel";
import { PermissionSetsPanel } from "./permission-sets-panel";
import { rolesColumns } from "./roles-columns";
import { toRoleRows, typeFilterOptions } from "./roles-row";
import { RolesTable } from "./roles-table";
import { WorkflowPanel } from "./workflow-panel";

export function RolesManager() {
  const rolesQuery = useAuthGetRoles({
    query: { page: 1, size: 100 },
  });
  const assignmentsQuery = useAuthGetRoleAssignments({});

  const rows = useMemo(
    () =>
      toRoleRows(
        rolesQuery.data?.data ?? [],
        assignmentsQuery.data?.data ?? []
      ),
    [rolesQuery.data, assignmentsQuery.data]
  );

  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>({ search: false });
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const table = useLegacyTable({
    data: rows,
    columns: rolesColumns,
    state: { columnFilters, columnVisibility, pagination, sorting },
    getRowId: (row) => row.id,
    autoResetPageIndex: false,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const searchQuery =
    (table.getColumn("search")?.getFilterValue() as string) ?? "";
  const typeFilter =
    (table.getColumn("type")?.getFilterValue() as string) ??
    typeFilterOptions[0];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        description="Manage access roles and the staff assigned to them."
        title="Roles & Permissions"
      />

      <Tabs className="gap-4" defaultValue="roles">
        <PageTabsList>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="organisation">Organisation</TabsTrigger>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="permission-sets">Permission sets</TabsTrigger>
          <TabsTrigger value="access-reviews">Access reviews</TabsTrigger>
        </PageTabsList>

        <TabsContent value="roles">
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-col items-stretch gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <InputGroup className="h-7 w-full sm:w-80">
                <InputGroupAddon align="inline-start">
                  <Search className="size-3.5" />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Search roles"
                  className="h-7"
                  onChange={(event) => {
                    table
                      .getColumn("search")
                      ?.setFilterValue(event.target.value || undefined);
                    table.setPageIndex(0);
                  }}
                  placeholder="Search roles..."
                  value={searchQuery}
                />
              </InputGroup>

              <Select
                onValueChange={(value) => {
                  table
                    .getColumn("type")
                    ?.setFilterValue(
                      !value || value === "All" ? undefined : value
                    );
                  table.setPageIndex(0);
                }}
                value={typeFilter}
              >
                <SelectTrigger size="sm">
                  <span className="text-muted-foreground">Type:</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  <SelectGroup>
                    {typeFilterOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <RolesTable table={table} />
          </div>
        </TabsContent>

        <TabsContent value="organisation">
          <OrganisationPanel />
        </TabsContent>
        <TabsContent value="workflows">
          <WorkflowPanel />
        </TabsContent>
        <TabsContent value="permission-sets">
          <PermissionSetsPanel />
        </TabsContent>
        <TabsContent value="access-reviews">
          <AccessReviewsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
