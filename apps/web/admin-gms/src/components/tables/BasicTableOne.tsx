"use client";

import {
  type ColumnFiltersState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Order {
  id: number;
  user: {
    image: string;
    name: string;
    role: string;
  };
  projectName: string;
  team: {
    images: string[];
  };
  status: string;
  budget: string;
}

// Base data for generating larger datasets
const baseUsers = [
  {
    image: "/images/user/user-17.jpg",
    name: "Lindsey Curtis",
    role: "Web Designer",
  },
  {
    image: "/images/user/user-18.jpg",
    name: "Kaiya George",
    role: "Project Manager",
  },
  {
    image: "/images/user/user-17.jpg",
    name: "Zain Geidt",
    role: "Content Writing",
  },
  {
    image: "/images/user/user-20.jpg",
    name: "Abram Schleifer",
    role: "Digital Marketer",
  },
  {
    image: "/images/user/user-21.jpg",
    name: "Carla George",
    role: "Front-end Developer",
  },
];

const projects = [
  "Agency Website",
  "Technology",
  "Blog Writing",
  "Social Media",
  "Website",
  "Mobile App",
  "Dashboard",
  "E-commerce",
];
const statuses = ["Active", "Pending", "Cancel"];
const teamImages = [
  [
    "/images/user/user-22.jpg",
    "/images/user/user-23.jpg",
    "/images/user/user-24.jpg",
  ],
  ["/images/user/user-25.jpg", "/images/user/user-26.jpg"],
  ["/images/user/user-27.jpg"],
  [
    "/images/user/user-28.jpg",
    "/images/user/user-29.jpg",
    "/images/user/user-30.jpg",
  ],
  ["/images/user/user-31.jpg", "/images/user/user-32.jpg"],
];

// Generate large dataset for virtualization demo
const generateLargeDataset = (count: number): Order[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    user: baseUsers[i % baseUsers.length],
    projectName: projects[i % projects.length],
    team: { images: teamImages[i % teamImages.length] },
    status: statuses[i % statuses.length],
    budget: `${(Math.random() * 50 + 1).toFixed(1)}K`,
  }));
};

// Generate 100 rows for virtualization demo
const tableData: Order[] = generateLargeDataset(100);

const columnHelper = createColumnHelper<Order>();

const columns = [
  columnHelper.accessor("user", {
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        type="button"
      >
        User
        <ArrowUpDown className="size-3.5" />
      </button>
    ),
    cell: ({ row }) => {
      const user = row.original.user;
      return (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-full">
            <Image alt={user.name} height={40} src={user.image} width={40} />
          </div>
          <div>
            <span className="block font-medium text-gray-800 text-theme-sm dark:text-white/90">
              {user.name}
            </span>
            <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
              {user.role}
            </span>
          </div>
        </div>
      );
    },
    sortingFn: (rowA, rowB) =>
      rowA.original.user.name.localeCompare(rowB.original.user.name),
    filterFn: (row, _, filterValue) => {
      const user = row.original.user;
      const searchValue = filterValue.toLowerCase();
      return (
        user.name.toLowerCase().includes(searchValue) ||
        user.role.toLowerCase().includes(searchValue)
      );
    },
  }),
  columnHelper.accessor("projectName", {
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        type="button"
      >
        Project Name
        <ArrowUpDown className="size-3.5" />
      </button>
    ),
    cell: ({ getValue }) => getValue(),
  }),
  columnHelper.accessor("team", {
    header: "Team",
    cell: ({ row }) => {
      const team = row.original.team;
      return (
        <div className="flex -space-x-2">
          {team.images.map((teamImage, index) => (
            <div
              className="h-6 w-6 overflow-hidden rounded-full border-2 border-white dark:border-gray-900"
              key={index}
            >
              <Image
                alt={`Team member ${index + 1}`}
                className="w-full"
                height={24}
                src={teamImage}
                width={24}
              />
            </div>
          ))}
        </div>
      );
    },
    enableSorting: false,
  }),
  columnHelper.accessor("status", {
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        type="button"
      >
        Status
        <ArrowUpDown className="size-3.5" />
      </button>
    ),
    cell: ({ getValue }) => {
      const status = getValue();
      return (
        <Badge
          variant={
            status === "Active"
              ? "light-success"
              : status === "Pending"
                ? "light-warning"
                : "light-error"
          }
        >
          {status}
        </Badge>
      );
    },
  }),
  columnHelper.accessor("budget", {
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        type="button"
      >
        Budget
        <ArrowUpDown className="size-3.5" />
      </button>
    ),
    cell: ({ getValue }) => getValue(),
    sortingFn: (rowA, rowB) => {
      const parseValue = (val: string) => {
        const num = Number.parseFloat(val.replace("K", ""));
        return val.includes("K") ? num * 1000 : num;
      };
      return (
        parseValue(rowA.original.budget) - parseValue(rowB.original.budget)
      );
    },
  }),
];

interface BasicTableOneProps {
  enableVirtualization?: boolean;
}

export default function BasicTableOne({
  enableVirtualization = false,
}: BasicTableOneProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const tableContainerRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: enableVirtualization
      ? undefined
      : getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const { rows } = table.getRowModel();

  // Virtualizer for large datasets
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 73, // Estimated row height
    getScrollElement: () => tableContainerRef.current,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  // Calculate padding for virtual scrolling
  const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
      : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      {/* Filter Controls */}
      <div className="flex items-center justify-between border-gray-100 border-b p-4 dark:border-white/[0.05]">
        <div className="relative max-w-sm">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-9"
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search users, projects..."
            value={globalFilter}
          />
        </div>
        <div className="flex items-center gap-4">
          {enableVirtualization && (
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-brand-600 text-xs dark:bg-brand-500/20 dark:text-brand-400">
              Virtual Scrolling
            </span>
          )}
          <span className="text-gray-500 text-sm">
            {table.getFilteredRowModel().rows.length} results
          </span>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto">
        <div className="min-w-[1102px]">
          {enableVirtualization ? (
            // Virtualized Table
            <div
              className="max-h-[500px] overflow-auto"
              ref={tableContainerRef}
            >
              <Table>
                <TableHeader className="sticky top-0 z-10 border-gray-100 border-b bg-white dark:border-white/[0.05] dark:bg-gray-900">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          className="px-5 py-3 text-start text-gray-500 text-theme-xs dark:text-gray-400"
                          key={header.id}
                        >
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

                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {paddingTop > 0 && (
                    <tr>
                      <td style={{ height: `${paddingTop}px` }} />
                    </tr>
                  )}
                  {virtualRows.map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    return (
                      <TableRow
                        data-index={virtualRow.index}
                        key={row.id}
                        ref={(node) => rowVirtualizer.measureElement(node)}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            className="px-5 py-4 text-start text-gray-500 text-theme-sm dark:text-gray-400"
                            key={cell.id}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                  {paddingBottom > 0 && (
                    <tr>
                      <td style={{ height: `${paddingBottom}px` }} />
                    </tr>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            // Standard Paginated Table
            <Table>
              <TableHeader className="border-gray-100 border-b dark:border-white/[0.05]">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        className="px-5 py-3 text-start text-gray-500 text-theme-xs dark:text-gray-400"
                        key={header.id}
                      >
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

              <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          className="px-5 py-4 text-start text-gray-500 text-theme-sm dark:text-gray-400"
                          key={cell.id}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="h-24 text-center"
                      colSpan={columns.length}
                    >
                      No results found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Pagination Controls - Only show when not virtualizing */}
      {!enableVirtualization && (
        <div className="flex items-center justify-between border-gray-100 border-t p-4 dark:border-white/[0.05]">
          <div className="text-gray-500 text-sm">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </div>
          <div className="flex items-center gap-2">
            <Button
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              size="sm"
              variant="outline"
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              size="sm"
              variant="outline"
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
