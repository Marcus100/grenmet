"use client";
"use no memo";

import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import { RoleRowActions } from "./role-row-actions";
import type { RoleRow, RoleRowType } from "./roles-row";

const typeMeta: Record<RoleRowType, string> = {
  Custom: "border-border bg-muted/50 text-muted-foreground",
  System: "border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

function TypeBadge({ type }: { type: RoleRowType }) {
  return (
    <Badge
      className={cn("border px-2 py-1 font-medium", typeMeta[type])}
      variant="outline"
    >
      {type}
    </Badge>
  );
}

export const rolesColumns: LegacyColumnDef<RoleRow>[] = [
  {
    id: "search",
    accessorFn: (row) => `${row.name} ${row.description}`,
    filterFn: "includesString",
    enableHiding: true,
  },
  {
    accessorKey: "name",
    header: "Role",
    cell: ({ row }) => (
      <span className="font-medium text-foreground text-sm">
        {row.original.name}
      </span>
    ),
  },
  {
    accessorKey: "description",
    header: "Description",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.description}
      </span>
    ),
  },
  {
    accessorKey: "type",
    header: "Type",
    filterFn: "equalsString",
    cell: ({ row }) => <TypeBadge type={row.original.type} />,
  },
  {
    accessorKey: "users",
    header: "Users",
    cell: ({ row }) => (
      <span className="text-foreground text-sm tabular-nums">
        {row.original.users}
      </span>
    ),
  },
  {
    id: "updatedDate",
    accessorFn: (row) => row.updatedAt,
    header: "Last updated",
    cell: ({ row }) => (
      <div className="text-foreground text-sm">{row.original.updatedDate}</div>
    ),
  },
  {
    id: "actions",
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => (
      <div className="text-right">
        <RoleRowActions row={row.original} />
      </div>
    ),
    enableHiding: false,
    enableSorting: false,
  },
];
