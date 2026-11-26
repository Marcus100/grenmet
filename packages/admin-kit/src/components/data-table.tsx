"use client";
"use no memo";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { Skeleton } from "@barrelsgd/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { cn } from "@barrelsgd/ui/lib/utils";
import {
  flexRender,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type LegacyColumnDef,
  useLegacyTable,
} from "@tanstack/react-table/legacy";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import {
  type ReactNode,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { EmptyState, type EmptyStateProps } from "./empty-state";

/** A column, as TanStack Table describes it: `{ accessorKey: "name", header: "Name" }`. Give text headers so cards can label values. */
export type DataTableColumn<TData extends RowData> = LegacyColumnDef<TData>;

export interface DataTableProps<TData extends RowData> {
  /** The heading of each phone card; the first column's text if omitted. */
  readonly cardTitle?: (row: TData) => ReactNode;
  readonly className?: string;
  /** Table columns. Plain-text `header`s become the labels on phone cards. */
  readonly columns: readonly DataTableColumn<TData>[];
  readonly data: readonly TData[];
  /** What an empty table says: what is missing and the next step. */
  readonly empty: EmptyStateProps;
  readonly getRowId?: (row: TData, index: number) => string;
  /** Sort applied on first load. */
  readonly initialSorting?: SortingState;
  /** The table's name for assistive technology: "Services". */
  readonly label: string;
  /** Show skeleton rows while the app loads the data. */
  readonly loading?: boolean;
  readonly pageSize?: number;
  /** Row actions (a menu or buttons), added as a last column and on phone cards. */
  readonly rowActions?: (row: TData) => ReactNode;
  /** Show the search box. Default true. */
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  /** Extra controls beside the search box (filters, an Add button). */
  readonly toolbar?: ReactNode;
}

function SortIcon({
  direction,
}: {
  readonly direction: false | "asc" | "desc";
}) {
  if (direction === "asc") {
    return <ArrowUp aria-hidden="true" className="size-3.5" />;
  }
  if (direction === "desc") {
    return <ArrowDown aria-hidden="true" className="size-3.5" />;
  }
  return <ArrowUpDown aria-hidden="true" className="size-3.5 opacity-50" />;
}

const PHONE_QUERY = "(max-width: 639px)";

function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True below the `sm` breakpoint. The server and first render assume the table. */
function usePhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  );
}

const ARIA_SORT = {
  none: undefined,
  asc: "ascending",
  desc: "descending",
} as const;

const SKELETON_ROWS = ["a", "b", "c", "d", "e"] as const;
const SKELETON_CARDS = ["a", "b", "c"] as const;

const ACTIONS_ID = "__actions";

/**
 * A table the whole admin shares: sortable columns, a search box, pagination,
 * row actions, a card list under the `sm` breakpoint, and written loading and
 * empty states. The app passes the rows; the kit never fetches.
 */
export function DataTable<TData extends RowData>({
  cardTitle,
  className,
  columns,
  data,
  empty,
  getRowId,
  initialSorting = [],
  label,
  loading = false,
  pageSize = 10,
  rowActions,
  searchable = true,
  searchPlaceholder = "Search",
  toolbar,
}: DataTableProps<TData>) {
  const searchId = useId();
  const [sorting, setSorting] = useState<SortingState>([...initialSorting]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

  const allColumns = useMemo(() => {
    const base = [...columns];
    if (rowActions) {
      base.push({
        id: ACTIONS_ID,
        header: "Actions",
        enableSorting: false,
        enableGlobalFilter: false,
        cell: ({ row }) => rowActions(row.original),
      });
    }
    return base;
  }, [columns, rowActions]);

  const table = useLegacyTable<TData>({
    data: data as TData[],
    columns: allColumns,
    state: { sorting, globalFilter, pagination },
    getRowId,
    // Controlled pagination: a parent passing a new array must not send the
    // reader back to page 1. The page is clamped below when rows shrink.
    autoResetPageIndex: false,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const phone = usePhone();
  const rows = table.getRowModel().rows;
  const total = table.getFilteredRowModel().rows.length;
  const pageCount = Math.max(table.getPageCount(), 1);
  const pageIndex = table.getState().pagination.pageIndex;

  // When the filtered row count shrinks past the current page, step back to
  // the last page that exists (before paint, so no empty page flashes).
  useLayoutEffect(() => {
    if (pagination.pageIndex > pageCount - 1) {
      setPagination((previous) => ({
        ...previous,
        pageIndex: Math.max(pageCount - 1, 0),
      }));
    }
  }, [pageCount, pagination.pageIndex]);

  const updateSearch = (value: string) => {
    setGlobalFilter(value);
    setPagination((previous) => ({ ...previous, pageIndex: 0 }));
  };
  const sortableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanSort());
  const activeSort = sorting[0];
  const sortValue = activeSort
    ? `${activeSort.id}:${activeSort.desc ? "desc" : "asc"}`
    : "";
  const first = total === 0 ? 0 : pageIndex * pagination.pageSize + 1;
  const last = Math.min((pageIndex + 1) * pagination.pageSize, total);
  const searching = globalFilter.trim() !== "";
  const showEmpty = !loading && data.length === 0;
  const showNoMatch = !loading && data.length > 0 && total === 0;
  const visibleColumns = table.getVisibleLeafColumns();
  const cardColumns = visibleColumns.filter(
    (column) => column.id !== ACTIONS_ID
  );

  const noMatch = (
    <EmptyState
      action={
        <Button
          onClick={() => updateSearch("")}
          type="button"
          variant="outline"
        >
          Clear search
        </Button>
      }
      description="Try a different word, or clear the search to see every row."
      icon={<Search />}
      title={`Nothing matches “${globalFilter.trim()}”.`}
    />
  );

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {searchable || toolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {searchable ? (
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <label className="sr-only" htmlFor={searchId}>
                {`Search ${label}`}
              </label>
              <Search
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              />
              <Input
                className="min-h-11 pl-8 sm:min-h-0"
                id={searchId}
                onChange={(event) => updateSearch(event.target.value)}
                placeholder={searchPlaceholder}
                type="search"
                value={globalFilter}
              />
            </div>
          ) : null}
          {toolbar}
        </div>
      ) : null}

      {showEmpty ? <EmptyState {...empty} /> : null}
      {showNoMatch ? noMatch : null}

      {showEmpty || showNoMatch ? null : (
        <>
          {phone ? null : (
            <div aria-busy={loading} data-slot="data-table-table">
              <Table aria-label={label}>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        const sortable = header.column.getCanSort();
                        const direction = header.column.getIsSorted();
                        const content = header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            );
                        return (
                          <TableHead
                            aria-sort={
                              ARIA_SORT[
                                direction === false ? "none" : direction
                              ]
                            }
                            key={header.id}
                          >
                            {sortable ? (
                              <button
                                className="hover:text-foreground focus-visible:outline-ring -mx-1 inline-flex min-h-8 items-center gap-1 rounded px-1 focus-visible:outline-2"
                                onClick={header.column.getToggleSortingHandler()}
                                type="button"
                              >
                                {content}
                                <SortIcon direction={direction} />
                              </button>
                            ) : (
                              content
                            )}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {loading
                    ? SKELETON_ROWS.slice(0, Math.min(pageSize, 5)).map(
                        (key) => (
                          <TableRow key={`loading-${key}`}>
                            {visibleColumns.map((column) => (
                              <TableCell key={column.id}>
                                <Skeleton className="h-4 w-full max-w-40" />
                              </TableCell>
                            ))}
                          </TableRow>
                        )
                      )
                    : rows.map((row) => (
                        <TableRow key={row.id}>
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
          )}

          {phone ? (
            <div data-slot="data-table-cards">
              {sortableColumns.length > 0 && !loading ? (
                <div className="mb-3 flex items-center gap-2 text-sm">
                  <label
                    className="text-muted-foreground"
                    htmlFor={`${searchId}-sort`}
                  >
                    Sort by
                  </label>
                  <NativeSelect
                    className="min-w-0 flex-1"
                    id={`${searchId}-sort`}
                    onChange={(event) => {
                      const [id, direction] = event.target.value.split(":");
                      setSorting(
                        id ? [{ id, desc: direction === "desc" }] : []
                      );
                    }}
                    value={sortValue}
                  >
                    <NativeSelectOption value="">
                      Default order
                    </NativeSelectOption>
                    {sortableColumns.flatMap((column) => {
                      const header = column.columnDef.header;
                      const name =
                        typeof header === "string" ? header : column.id;
                      return [
                        <NativeSelectOption
                          key={`${column.id}:asc`}
                          value={`${column.id}:asc`}
                        >
                          {`${name} (A to Z)`}
                        </NativeSelectOption>,
                        <NativeSelectOption
                          key={`${column.id}:desc`}
                          value={`${column.id}:desc`}
                        >
                          {`${name} (Z to A)`}
                        </NativeSelectOption>,
                      ];
                    })}
                  </NativeSelect>
                </div>
              ) : null}
              {loading ? (
                <ul aria-hidden="true" className="grid gap-3">
                  {SKELETON_CARDS.map((key) => (
                    <li
                      className="bg-card rounded-xl border p-4"
                      key={`loading-card-${key}`}
                    >
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="mt-3 h-4 w-1/2" />
                    </li>
                  ))}
                </ul>
              ) : (
                <ul aria-label={`${label} list`} className="grid gap-3">
                  {rows.map((row) => (
                    <li className="bg-card rounded-xl border p-4" key={row.id}>
                      {cardTitle ? (
                        <p className="mb-3 font-medium">
                          {cardTitle(row.original)}
                        </p>
                      ) : null}
                      <dl className="grid gap-3 text-sm">
                        {cardColumns.map((column) => {
                          const cell = row
                            .getVisibleCells()
                            .find(
                              (candidate) => candidate.column.id === column.id
                            );
                          const header = column.columnDef.header;
                          return (
                            <div
                              className="grid min-w-0 gap-0.5"
                              key={column.id}
                            >
                              {typeof header === "string" ? (
                                <dt className="text-muted-foreground text-xs">
                                  {header}
                                </dt>
                              ) : null}
                              <dd className="min-w-0 break-words">
                                {cell
                                  ? flexRender(
                                      cell.column.columnDef.cell,
                                      cell.getContext()
                                    )
                                  : null}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                      {rowActions ? (
                        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                          {rowActions(row.original)}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {loading ? (
            <p className="sr-only" role="status">
              Loading {label}
            </p>
          ) : (
            <nav
              aria-label={`${label} pages`}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <p aria-live="polite" className="text-muted-foreground">
                {searching
                  ? `Showing ${first}–${last} of ${total} matching rows`
                  : `Showing ${first}–${last} of ${total} rows`}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  className="min-h-11 sm:min-h-0"
                  disabled={!table.getCanPreviousPage()}
                  onClick={() => table.previousPage()}
                  type="button"
                  variant="outline"
                >
                  <ChevronLeft aria-hidden="true" />
                  Previous
                </Button>
                <span className="text-muted-foreground tabular-nums">
                  Page {pageIndex + 1} of {pageCount}
                </span>
                <Button
                  className="min-h-11 sm:min-h-0"
                  disabled={!table.getCanNextPage()}
                  onClick={() => table.nextPage()}
                  type="button"
                  variant="outline"
                >
                  Next
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
