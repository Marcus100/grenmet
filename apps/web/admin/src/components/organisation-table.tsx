import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
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

/**
 * An empty list is explained, never shown as bare text. With filters on it says
 * nothing matches and offers "Clear filters"; with none on it says there are no
 * organisations yet. Both offer "New organisation".
 */
export function OrganisationTable({
  filtered = false,
  rows,
}: {
  filtered?: boolean;
  rows: OrganisationRow[];
}) {
  if (rows.length === 0) {
    return (
      <Empty role="status">
        <EmptyHeader>
          <EmptyTitle>
            {filtered ? "No organisations match" : "No organisations yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Nothing matches the search or filters. Clear them to see every organisation."
              : "Create the first organisation to add members and apps."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap justify-center">
          {filtered ? (
            <Button
              nativeButton={false}
              render={<Link href="/organisations" />}
              size="default"
              variant="outline"
            >
              Clear filters
            </Button>
          ) : null}
          <Button
            nativeButton={false}
            render={<Link href="/organisations/new" />}
            size="default"
          >
            New organisation
          </Button>
        </EmptyContent>
      </Empty>
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
              <div className="text-muted-foreground font-mono text-xs">
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
