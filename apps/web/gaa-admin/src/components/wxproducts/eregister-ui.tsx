import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@barrelsgd/ui/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import type { LucideIcon } from "lucide-react";

export const GRID_CELL = "border-border border-r last:border-r-0";
export const HEAD_ROW = "bg-muted/50 hover:bg-muted/50";

export function SectionCard({
  action,
  children,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  title: React.ReactNode;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b py-3.5">
        <CardTitle className="text-sm">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="overflow-hidden rounded-b-xl p-0">
        {children}
      </CardContent>
    </Card>
  );
}

export interface CodedGroup {
  code: string;
  id: string;
  label: string;
  value: string;
}

export function CodedStrip({ groups }: { groups: CodedGroup[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className={HEAD_ROW}>
          {groups.map((group) => (
            <TableHead
              className={`${GRID_CELL} h-auto px-3 py-2 text-center`}
              key={group.id}
            >
              <div className="text-xs">{group.label}</div>
              <div className="font-mono font-normal text-[10px] text-muted-foreground">
                {group.code}
              </div>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          {groups.map((group) => (
            <TableCell
              className={`${GRID_CELL} px-3 py-2.5 text-center font-medium font-mono text-sm tabular-nums`}
              key={group.id}
            >
              {group.value}
            </TableCell>
          ))}
        </TableRow>
      </TableBody>
    </Table>
  );
}

export function SummaryHead({
  icon: Icon,
  label,
  unit,
}: {
  icon: LucideIcon;
  label: string;
  unit: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5 text-muted-foreground" />
      <span>{label}</span>
      <span className="font-normal text-muted-foreground text-xs">{unit}</span>
    </span>
  );
}
