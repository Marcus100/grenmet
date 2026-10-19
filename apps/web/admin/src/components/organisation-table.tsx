import { Badge } from "@barrelsgd/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import Link from "next/link";

export interface OrganisationRow {
  active_member_count: number;
  id: string;
  kind: string;
  name: string;
  slug: string;
  status: string;
  verified_at?: string | null;
}

export function OrganisationTable({ rows }: { rows: OrganisationRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground" role="status">
        No organisations match.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Members</TableHead>
          <TableHead>Verification</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link
                className="font-medium underline-offset-4 hover:underline"
                href={`/organisations/${encodeURIComponent(row.id)}`}
              >
                {row.name}
              </Link>
              <div className="font-mono text-muted-foreground text-xs">
                {row.slug}
              </div>
            </TableCell>
            <TableCell className="capitalize">{row.kind}</TableCell>
            <TableCell>
              <Badge
                variant={
                  row.status === "active" ? "light-success" : "light-warning"
                }
              >
                {row.status === "active" ? "Active" : "Suspended"}
              </Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.active_member_count}
            </TableCell>
            <TableCell>
              {row.verified_at ? "Verified" : "Not verified"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
