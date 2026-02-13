"use client";

import {
  type ColumnFiltersState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, Filter, Search, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

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

// Define the TypeScript interface for the table rows
interface Product {
  id: number;
  name: string;
  variants: string;
  category: string;
  price: string;
  image: string;
  status: "Delivered" | "Pending" | "Canceled";
}

// Define the table data using the interface
const tableData: Product[] = [
  {
    id: 1,
    name: 'MacBook Pro 13"',
    variants: "2 Variants",
    category: "Laptop",
    price: "$2399.00",
    status: "Delivered",
    image: "/images/product/product-01.jpg",
  },
  {
    id: 2,
    name: "Apple Watch Ultra",
    variants: "1 Variant",
    category: "Watch",
    price: "$879.00",
    status: "Pending",
    image: "/images/product/product-02.jpg",
  },
  {
    id: 3,
    name: "iPhone 15 Pro Max",
    variants: "2 Variants",
    category: "SmartPhone",
    price: "$1869.00",
    status: "Delivered",
    image: "/images/product/product-03.jpg",
  },
  {
    id: 4,
    name: "iPad Pro 3rd Gen",
    variants: "2 Variants",
    category: "Electronics",
    price: "$1699.00",
    status: "Canceled",
    image: "/images/product/product-04.jpg",
  },
  {
    id: 5,
    name: "AirPods Pro 2nd Gen",
    variants: "1 Variant",
    category: "Accessories",
    price: "$240.00",
    status: "Delivered",
    image: "/images/product/product-05.jpg",
  },
];

const columnHelper = createColumnHelper<Product>();

const columns = [
  columnHelper.accessor("name", {
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        type="button"
      >
        Products
        <ArrowUpDown className="size-3.5" />
      </button>
    ),
    cell: ({ row }) => {
      const product = row.original;
      return (
        <div className="flex items-center gap-3">
          <div className="h-[50px] w-[50px] overflow-hidden rounded-md">
            <Image
              alt={product.name}
              className="h-[50px] w-[50px]"
              height={50}
              src={product.image}
              width={50}
            />
          </div>
          <div>
            <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
              {product.name}
            </p>
            <span className="text-gray-500 text-theme-xs dark:text-gray-400">
              {product.variants}
            </span>
          </div>
        </div>
      );
    },
  }),
  columnHelper.accessor("category", {
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        type="button"
      >
        Category
        <ArrowUpDown className="size-3.5" />
      </button>
    ),
    cell: ({ getValue }) => getValue(),
  }),
  columnHelper.accessor("price", {
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        type="button"
      >
        Price
        <ArrowUpDown className="size-3.5" />
      </button>
    ),
    cell: ({ getValue }) => getValue(),
    sortingFn: (rowA, rowB) => {
      // Parse price values like "$2399.00" to numbers
      const parsePrice = (val: string) =>
        Number.parseFloat(val.replace("$", "").replace(",", ""));
      return parsePrice(rowA.original.price) - parsePrice(rowB.original.price);
    },
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
            status === "Delivered"
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
];

export default function RecentOrders() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [showFilter, setShowFilter] = useState(false);

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
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pt-4 pb-3 sm:px-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-gray-800 text-lg dark:text-white/90">
            Recent Orders
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <Button
            className="gap-2"
            onClick={() => setShowFilter(!showFilter)}
            size="sm"
            variant="outline"
          >
            <Filter className="size-4" />
            Filter
          </Button>
          <Button size="sm" variant="outline">
            See all
          </Button>
        </div>
      </div>

      {/* Filter Input */}
      {showFilter && (
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pr-8 pl-9"
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search products..."
            value={globalFilter}
          />
          {globalFilter && (
            <button
              className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setGlobalFilter("")}
              type="button"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      <div className="max-w-full overflow-x-auto">
        <Table>
          {/* Table Header */}
          <TableHeader className="border-gray-100 border-y dark:border-gray-800">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className="py-3 text-start text-gray-500 text-theme-xs dark:text-gray-400"
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

          {/* Table Body */}
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      className="py-3 text-gray-500 text-theme-sm dark:text-gray-400"
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
      </div>
    </div>
  );
}
