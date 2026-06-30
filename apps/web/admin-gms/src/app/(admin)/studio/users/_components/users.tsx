"use client";
"use no memo";

import { Button } from "@grenmet/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@grenmet/ui/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@grenmet/ui/components/ui/input-group";
import { Kbd } from "@grenmet/ui/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@grenmet/ui/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@grenmet/ui/components/ui/tabs";
import {
  type ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  Cog,
  Download,
  Grid,
  Plus,
  Rows3,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import * as React from "react";

import { filters, type UserRow } from "./data";
import { usersColumns } from "./users-columns";
import { UsersTable } from "./users-table";

export function Users({ users }: { users: UserRow[] }) {
  const [rowSelection, setRowSelection] = React.useState({});
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "joinedDate", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({
      search: false,
      team: false,
    });
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const table = useReactTable({
    data: users,
    columns: usersColumns,
    state: {
      rowSelection,
      sorting,
      columnFilters,
      columnVisibility,
      pagination,
    },
    getRowId: (row) => row.email,
    autoResetPageIndex: false,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
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
  const roleFilter =
    (table.getColumn("role")?.getFilterValue() as string) ?? filters.role[0];
  const teamFilter =
    (table.getColumn("team")?.getFilterValue() as string) ?? filters.team[0];
  const statusFilter =
    (table.getColumn("status")?.getFilterValue() as string) ??
    filters.status[0];
  const workspaceFilter =
    (table.getColumn("workspace")?.getFilterValue() as string) ??
    filters.workspace[0];
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  function setColumnSelectFilter(columnId: string, value: string | null) {
    table
      .getColumn(columnId)
      ?.setFilterValue(!value || value === "All" ? undefined : value);
    table.setPageIndex(0);
  }

  return (
    <Card>
      <CardHeader className="border-b has-data-[slot=card-action]:grid-cols-1 md:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
        <CardTitle className="text-xl leading-none">Users</CardTitle>
        <CardDescription className="max-w-sm leading-snug">
          Manage your organization members and their access.
        </CardDescription>
        <CardAction className="col-start-1 row-start-auto flex w-full flex-wrap justify-start gap-2 justify-self-stretch md:col-start-2 md:row-span-2 md:row-start-1 md:w-auto md:flex-nowrap md:justify-end md:justify-self-end">
          <InputGroup className="h-7 w-full md:w-64">
            <InputGroupAddon align="inline-start">
              <Search className="size-3.5" />
            </InputGroupAddon>
            <InputGroupInput
              className="h-7"
              onChange={(event) => {
                table
                  .getColumn("search")
                  ?.setFilterValue(event.target.value || undefined);
                table.setPageIndex(0);
              }}
              placeholder="Search users..."
              value={searchQuery}
            />
            <InputGroupAddon align="inline-end">
              <Kbd className="h-4 text-[10px]">⌘K</Kbd>
            </InputGroupAddon>
          </InputGroup>
          <Button size="sm" variant="outline">
            <SlidersHorizontal /> Hide
          </Button>
          <Button size="sm" variant="outline">
            <Cog /> Customize
          </Button>
          <Button size="sm" variant="outline">
            <Download /> Export
          </Button>
          <Button size="sm">
            <Plus /> Add User
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              onValueChange={(value) => setColumnSelectFilter("role", value)}
              value={roleFilter}
            >
              <SelectTrigger size="sm">
                <span className="text-muted-foreground">Role:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  {filters.role.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              onValueChange={(value) => setColumnSelectFilter("team", value)}
              value={teamFilter}
            >
              <SelectTrigger size="sm">
                <span className="text-muted-foreground">Team:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  {filters.team.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              onValueChange={(value) => setColumnSelectFilter("status", value)}
              value={statusFilter}
            >
              <SelectTrigger size="sm">
                <span className="text-muted-foreground">Status:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  {filters.status.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <Select
            onValueChange={(value) => setColumnSelectFilter("workspace", value)}
            value={workspaceFilter}
          >
            <SelectTrigger size="sm">
              <span className="text-muted-foreground">Workspace:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" alignItemWithTrigger={false}>
              <SelectGroup>
                {filters.workspace.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-3 px-4">
          <div className="text-muted-foreground text-sm tabular-nums">
            {selectedCount} selected
          </div>

          <Tabs defaultValue="list">
            <TabsList>
              <TabsTrigger aria-label="List view" value="list">
                <Rows3 />
              </TabsTrigger>
              <TabsTrigger aria-label="Grid view" value="grid">
                <Grid />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <UsersTable table={table} />
      </CardContent>
    </Card>
  );
}
