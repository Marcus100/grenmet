"use client";
"use no memo";

import type { SrcAuthSchemasRolePublic as RolePublic } from "@grenmet/api-client";
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
} from "@grenmet/ui/components/ui/avatar";
import { Badge } from "@grenmet/ui/components/ui/badge";
import { Checkbox } from "@grenmet/ui/components/ui/checkbox";
import { cn, getInitials } from "@grenmet/ui/lib/utils";
import type { ColumnDef, RowData } from "@tanstack/react-table";
import { Check, Clock, X } from "lucide-react";
import { UserRowActions } from "./user-row-actions";
import type { UserRow, UserRowStatus } from "./users-row";

declare module "@tanstack/react-table" {
  interface TableMeta<TData extends RowData> {
    /** Live role list, threaded to the actions cell for the manage dialog. */
    roles?: RolePublic[];
  }
}

const statusMeta: Record<
  UserRowStatus,
  { badgeClass: string; dotClass: string }
> = {
  Active: {
    badgeClass:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    dotClass: "bg-emerald-500",
  },
  Deactivated: {
    badgeClass: "border-border bg-muted/50 text-muted-foreground",
    dotClass: "bg-muted-foreground",
  },
};

function StatusBadge({ status }: { status: UserRowStatus }) {
  const meta = statusMeta[status];

  return (
    <Badge
      className={cn("gap-1.5 border px-2 py-1 font-medium", meta.badgeClass)}
      variant="outline"
    >
      <span className={cn("size-1.5 rounded-full", meta.dotClass)} />
      {status}
    </Badge>
  );
}

function getAvatarTone(name: string) {
  const tones = [
    "[&_[data-slot=avatar-fallback]]:bg-amber-100 [&_[data-slot=avatar-fallback]]:text-amber-700 after:border-amber-200 dark:[&_[data-slot=avatar-fallback]]:bg-amber-500/15 dark:[&_[data-slot=avatar-fallback]]:text-amber-300 dark:after:border-amber-500/20",
    "[&_[data-slot=avatar-fallback]]:bg-orange-100 [&_[data-slot=avatar-fallback]]:text-orange-700 after:border-orange-200 dark:[&_[data-slot=avatar-fallback]]:bg-orange-500/15 dark:[&_[data-slot=avatar-fallback]]:text-orange-300 dark:after:border-orange-500/20",
    "[&_[data-slot=avatar-fallback]]:bg-rose-100 [&_[data-slot=avatar-fallback]]:text-rose-700 after:border-rose-200 dark:[&_[data-slot=avatar-fallback]]:bg-rose-500/15 dark:[&_[data-slot=avatar-fallback]]:text-rose-300 dark:after:border-rose-500/20",
    "[&_[data-slot=avatar-fallback]]:bg-fuchsia-100 [&_[data-slot=avatar-fallback]]:text-fuchsia-700 after:border-fuchsia-200 dark:[&_[data-slot=avatar-fallback]]:bg-fuchsia-500/15 dark:[&_[data-slot=avatar-fallback]]:text-fuchsia-300 dark:after:border-fuchsia-500/20",
    "[&_[data-slot=avatar-fallback]]:bg-purple-100 [&_[data-slot=avatar-fallback]]:text-purple-700 after:border-purple-200 dark:[&_[data-slot=avatar-fallback]]:bg-purple-500/15 dark:[&_[data-slot=avatar-fallback]]:text-purple-300 dark:after:border-purple-500/20",
    "[&_[data-slot=avatar-fallback]]:bg-indigo-100 [&_[data-slot=avatar-fallback]]:text-indigo-700 after:border-indigo-200 dark:[&_[data-slot=avatar-fallback]]:bg-indigo-500/15 dark:[&_[data-slot=avatar-fallback]]:text-indigo-300 dark:after:border-indigo-500/20",
    "[&_[data-slot=avatar-fallback]]:bg-sky-100 [&_[data-slot=avatar-fallback]]:text-sky-700 after:border-sky-200 dark:[&_[data-slot=avatar-fallback]]:bg-sky-500/15 dark:[&_[data-slot=avatar-fallback]]:text-sky-300 dark:after:border-sky-500/20",
    "[&_[data-slot=avatar-fallback]]:bg-emerald-100 [&_[data-slot=avatar-fallback]]:text-emerald-700 after:border-emerald-200 dark:[&_[data-slot=avatar-fallback]]:bg-emerald-500/15 dark:[&_[data-slot=avatar-fallback]]:text-emerald-300 dark:after:border-emerald-500/20",
  ];

  return tones[name.length % tones.length];
}

function getLastActiveBadge(lastActive: number) {
  if (lastActive < 1) {
    return {
      className: "bg-green-600 text-green-950 [&>svg]:text-white",
      icon: Check,
    };
  }

  if (lastActive < 4 * 60) {
    return { className: "bg-amber-500 text-amber-950", icon: Clock };
  }

  if (lastActive < 7 * 24 * 60) {
    return { className: "bg-destructive", icon: null };
  }

  return { className: "bg-muted-foreground text-muted", icon: X };
}

function AvatarCell({
  lastActive,
  name,
}: {
  lastActive: number;
  name: string;
}) {
  const badge = getLastActiveBadge(lastActive);
  const BadgeIcon = badge.icon;

  return (
    <Avatar className={cn("font-medium", getAvatarTone(name))} size="lg">
      <AvatarFallback>{getInitials(name)}</AvatarFallback>
      <AvatarBadge className={badge.className}>
        {BadgeIcon ? <BadgeIcon /> : null}
      </AvatarBadge>
    </Avatar>
  );
}

function RoleCell({
  roles,
  isSuperuser,
}: {
  roles: string[];
  isSuperuser: boolean;
}) {
  const [primary, ...rest] = roles;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {primary ? (
        <span className="whitespace-nowrap text-sm">{primary}</span>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      )}
      {rest.length > 0 ? (
        <Badge className="font-normal" variant="secondary">
          +{rest.length}
        </Badge>
      ) : null}
      {isSuperuser ? (
        <Badge className="font-normal" variant="outline">
          superuser
        </Badge>
      ) : null}
    </div>
  );
}

/** Match against the selected role filter; "roles" is a string[] on the row. */
function includesRole(
  row: { getValue: (id: string) => unknown },
  _id: string,
  value: string
) {
  const roles = row.getValue("role") as string[];
  return Array.isArray(roles) && roles.includes(value);
}

export const usersColumns: ColumnDef<UserRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          aria-label="Select all users"
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          aria-label={`Select ${row.original.name}`}
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
        />
      </div>
    ),
    enableHiding: false,
    enableSorting: false,
  },
  {
    id: "search",
    accessorFn: (row) => `${row.name} ${row.email} ${row.username}`,
    filterFn: "includesString",
    enableHiding: true,
  },
  {
    accessorKey: "name",
    header: "User",
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <AvatarCell
          lastActive={row.original.lastActiveMinutes}
          name={row.original.name}
        />
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground text-sm">
            {row.original.name}
          </div>
          <div className="truncate text-muted-foreground text-sm">
            {row.original.email}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "role",
    accessorFn: (row) => row.roles,
    header: "Role",
    filterFn: includesRole,
    enableSorting: false,
    cell: ({ row }) => (
      <RoleCell
        isSuperuser={row.original.isSuperuser}
        roles={row.original.roles}
      />
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    filterFn: "equalsString",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: "joinedDate",
    accessorFn: (row) => row.joinedAt,
    header: "Joined date",
    cell: ({ row }) => (
      <div className="text-foreground text-sm">{row.original.joinedDate}</div>
    ),
  },
  {
    id: "actions",
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row, table }) => (
      <div className="text-right">
        <UserRowActions
          roles={table.options.meta?.roles ?? []}
          row={row.original}
        />
      </div>
    ),
    enableHiding: false,
    enableSorting: false,
  },
];
