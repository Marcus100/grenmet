"use client";
"use no memo";

import { Button } from "@grenmet/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@grenmet/ui/components/ui/dropdown-menu";
import { Input } from "@grenmet/ui/components/ui/input";
import { cn } from "@grenmet/ui/lib/utils";
import type { Table } from "@tanstack/react-table";
import { Settings2, X } from "lucide-react";

import { TaskPriorityFilter } from "./task-priority-filter";
import { TaskStatusFilter } from "./task-status-filter";

interface TasksToolbarProps<TData> {
  table: Table<TData>;
}

export function TasksToolbar<TData>({ table }: TasksToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;
  const searchValue =
    (table.getColumn("title")?.getFilterValue() as string) ?? "";
  const hideableColumns = table
    .getAllColumns()
    .filter(
      (column) =>
        typeof column.accessorFn !== "undefined" && column.getCanHide()
    );
  const hiddenColumns = hideableColumns.filter(
    (column) => !column.getIsVisible()
  );

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          className="w-full bg-background text-foreground placeholder:text-muted-foreground sm:w-64"
          onChange={(event) => {
            table.getColumn("title")?.setFilterValue(event.target.value);
            table.setPageIndex(0);
          }}
          placeholder="Filter tasks..."
          value={searchValue}
        />
        <TaskStatusFilter table={table} />
        <TaskPriorityFilter table={table} />
        {isFiltered && (
          <Button
            onClick={() => {
              table.resetColumnFilters();
              table.setPageIndex(0);
            }}
            variant="destructive"
          >
            <X data-icon="inline-start" />
            Reset
          </Button>
        )}
      </div>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                className={cn(
                  "ml-auto hidden lg:flex",
                  hiddenColumns.length > 0 && "bg-muted text-foreground"
                )}
                size="sm"
                variant="outline"
              />
            }
          >
            <Settings2 data-icon="inline-start" />
            View
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-38">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {hideableColumns.map((column) => (
                <DropdownMenuCheckboxItem
                  checked={column.getIsVisible()}
                  className="capitalize"
                  key={column.id}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {column.id}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
