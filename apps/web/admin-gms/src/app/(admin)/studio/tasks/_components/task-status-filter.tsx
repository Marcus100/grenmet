"use client";
"use no memo";

import { Button } from "@grenmet/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@grenmet/ui/components/ui/dropdown-menu";
import { cn } from "@grenmet/ui/lib/utils";
import type { Table } from "@tanstack/react-table";
import { ListFilter, X } from "lucide-react";

import { statuses } from "./data";

interface TaskStatusFilterProps<TData> {
  table: Table<TData>;
}

export function TaskStatusFilter<TData>({
  table,
}: TaskStatusFilterProps<TData>) {
  const column = table.getColumn("status");

  if (!column) {
    return null;
  }

  const statusColumn = column;
  const selectedValues = new Set(statusColumn.getFilterValue() as string[]);

  function updateFilter(value: string) {
    if (selectedValues.has(value)) {
      selectedValues.delete(value);
    } else {
      selectedValues.add(value);
    }

    const filterValues = Array.from(selectedValues);
    statusColumn.setFilterValue(filterValues.length ? filterValues : undefined);
    table.setPageIndex(0);
  }

  function clearFilter() {
    statusColumn.setFilterValue(undefined);
    table.setPageIndex(0);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className={cn(
              "border-dashed",
              selectedValues.size > 0 && "border-solid bg-muted text-foreground"
            )}
            variant="outline"
          />
        }
      >
        <ListFilter data-icon="inline-start" />
        Status
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-50">
        <DropdownMenuGroup>
          {statuses.map((status) => {
            const isSelected = selectedValues.has(status.value);

            return (
              <DropdownMenuCheckboxItem
                checked={isSelected}
                key={status.value}
                onCheckedChange={() => updateFilter(status.value)}
                onSelect={(event) => event.preventDefault()}
              >
                <status.icon className="text-muted-foreground" />
                {status.label}
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuGroup>
        {selectedValues.size > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="justify-center text-center"
                onSelect={clearFilter}
              >
                <X />
                Clear filters
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
