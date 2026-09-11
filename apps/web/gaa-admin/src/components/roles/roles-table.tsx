"use client";
"use no memo";

import { Badge } from "@barrelsgd/ui/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@barrelsgd/ui/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barrelsgd/ui/components/ui/select";
import { Separator } from "@barrelsgd/ui/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { flexRender } from "@tanstack/react-table";
import type { LegacyReactTable, LegacyRow } from "@tanstack/react-table/legacy";
import { Fragment, type MouseEvent } from "react";

import type { RoleRow, RoleRowType } from "./roles-row";

function preventPaginationNavigation(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
}

function getPageNumbers(currentPage: number, pageCount: number) {
  if (pageCount <= 3) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  if (currentPage <= 2) return [1, 2, 3];
  if (currentPage >= pageCount - 1)
    return [pageCount - 2, pageCount - 1, pageCount];

  return [currentPage - 1, currentPage, currentPage + 1];
}

const GROUP_LABELS: Record<RoleRowType, string> = {
  Custom: "Custom roles",
  System: "System roles",
};

/** Group order is meaningful: built-in roles first, operator-created after. */
const GROUP_ORDER: RoleRowType[] = ["System", "Custom"];

interface RoleGroup {
  rows: LegacyRow<RoleRow>[];
  type: RoleRowType;
}

/**
 * Partition the current page's rows by role type, preserving each group's
 * existing sort order. Empty groups are dropped so a filtered view shows only
 * the headers it actually has rows for.
 */
function groupRows(rows: LegacyRow<RoleRow>[]): RoleGroup[] {
  return GROUP_ORDER.map((type) => ({
    rows: rows.filter((row) => row.original.type === type),
    type,
  })).filter((group) => group.rows.length > 0);
}

export function RolesTable({ table }: { table: LegacyReactTable<RoleRow> }) {
  const rows = table.getRowModel().rows;
  const columnCount = table.getVisibleLeafColumns().length;
  const pageCount = Math.max(table.getPageCount(), 1);
  const currentPage = Math.min(
    table.getState().pagination.pageIndex + 1,
    pageCount
  );
  const pageNumbers = getPageNumbers(currentPage, pageCount);
  const rowsPerPage = `${table.getState().pagination.pageSize}`;
  const totalRows = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize } = table.getState().pagination;
  const firstRowOnPage = pageIndex * pageSize + 1;
  const lastRowOnPage = Math.min((pageIndex + 1) * pageSize, totalRows);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
          <TableHeader className="[&_tr]:border-t">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead className="py-4 font-normal" key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {rows.length ? (
              groupRows(rows).map((group) => (
                <Fragment key={group.type}>
                  <TableRow className="border-border/60 hover:bg-transparent">
                    <TableCell
                      className="bg-muted/50 px-4 py-2"
                      colSpan={columnCount}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-muted-foreground text-xs">
                          {GROUP_LABELS[group.type]}
                        </span>
                        <Badge
                          className="rounded-sm px-1.5 font-normal text-[10px] tabular-nums"
                          variant="outline"
                        >
                          {group.rows.length}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                  {group.rows.map((row) => (
                    <TableRow
                      className="border-border/60 hover:bg-white/2.5"
                      data-state={row.getIsSelected() && "selected"}
                      key={row.id}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          className="px-3 py-4 align-middle"
                          key={cell.id}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-24 text-center"
                  colSpan={table.getVisibleLeafColumns().length}
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Separator />

      <div className="flex items-center justify-between px-4">
        <div className="flex items-center gap-4 text-muted-foreground text-sm">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <Select
              onValueChange={(value) => table.setPageSize(Number(value))}
              value={`${table.getState().pagination.pageSize}`}
            >
              <SelectTrigger
                className="w-20"
                id="roles-rows-per-page"
                size="sm"
              >
                <SelectValue placeholder={rowsPerPage} />
              </SelectTrigger>
              <SelectContent side="top">
                <SelectGroup>
                  {[10, 20, 30, 40, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <span>
            {totalRows === 0
              ? "No roles"
              : `Showing ${firstRowOnPage} to ${lastRowOnPage} of ${totalRows} roles`}
          </span>
        </div>

        <Pagination className="mx-0 w-auto justify-start md:justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                className={
                  table.getCanPreviousPage()
                    ? undefined
                    : "pointer-events-none opacity-50"
                }
                href="#"
                onClick={(event) => {
                  preventPaginationNavigation(event);
                  table.previousPage();
                }}
                text=""
              />
            </PaginationItem>
            {pageNumbers[0] > 1 ? (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            ) : null}
            {pageNumbers.map((pageNumber) => (
              <PaginationItem key={`page-${pageNumber}`}>
                <PaginationLink
                  href="#"
                  isActive={
                    table.getState().pagination.pageIndex === pageNumber - 1
                  }
                  onClick={(event) => {
                    preventPaginationNavigation(event);
                    table.setPageIndex(pageNumber - 1);
                  }}
                >
                  {pageNumber}
                </PaginationLink>
              </PaginationItem>
            ))}
            {(pageNumbers.at(-1) ?? 0) < pageCount ? (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            ) : null}
            <PaginationItem>
              <PaginationNext
                className={
                  table.getCanNextPage()
                    ? undefined
                    : "pointer-events-none opacity-50"
                }
                href="#"
                onClick={(event) => {
                  preventPaginationNavigation(event);
                  table.nextPage();
                }}
                text=""
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
