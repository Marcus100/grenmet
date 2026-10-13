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
import { cn } from "@barrelsgd/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  cellValue,
  type FieldColumn,
  type RegisterColumn,
  type RegisterGroup,
} from "./eregister-layout";
import { READINGS } from "./eregister-readings";

export const GRID_CELL = "border-border border-r last:border-r-0";
export const HEAD_ROW = "bg-muted/50 hover:bg-muted/50";

export function SectionCard({
  action,
  children,
  className,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  title: React.ReactNode;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
        <CardTitle className="font-semibold text-xs uppercase tracking-wide">
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className="overflow-hidden rounded-b-xl p-0">
        {children}
      </CardContent>
    </Card>
  );
}

function columnWidth(column: RegisterColumn): string {
  if (column.kind === "fixed") return "w-8 min-w-8";
  if (column.wide) return "min-w-56";
  if (column.signed?.role === "sign") return "w-10 min-w-10";
  return "w-12 min-w-12";
}

/**
 * A column name written upwards, like the paper register's headings. Long
 * names wrap into a second vertical line, so the header is only as tall as
 * the text needs.
 */
function VerticalName({
  children,
  half = false,
  muted = false,
}: {
  children: React.ReactNode;
  half?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-1 items-end justify-center pt-1 pb-1">
      <span
        className={cn(
          "block rotate-180 whitespace-normal text-center text-label leading-tight [writing-mode:vertical-rl]",
          half ? "max-h-14" : "max-h-24",
          muted ? "text-muted-foreground" : "font-semibold text-foreground"
        )}
      >
        {children}
      </span>
    </div>
  );
}

/**
 * One register section as a table, like the top part of the paper register: a
 * banner, each column headed by its name (written upwards), its WMO code and
 * its paper column number, then two layers of cells. The upper layer is a
 * plain reading calculated from the code (or an entry such as Gust or Wet
 * Bulb); the lower layer is the coded entry. Indicator digits sit in the lower
 * layer. `renderValue` swaps the read-only text for an input.
 */
export function RegisterTable({
  leads,
  renderValue,
  section,
  values,
}: {
  leads?: Record<string, string>;
  renderValue?: (
    column: FieldColumn,
    layer: "upper" | "lower"
  ) => React.ReactNode;
  section: RegisterGroup;
  values: Record<string, string>;
}) {
  const cellClass =
    "border-border border-r text-center font-medium font-mono text-body-sm tabular-nums";
  return (
    <Card className="w-fit max-w-full gap-0 overflow-hidden py-0">
      <CardContent className="overflow-x-auto p-0">
        <Table className="w-max border-collapse">
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead
                className="h-8 border-border border-b px-3 font-semibold text-xs uppercase tracking-wide"
                colSpan={section.columns.length}
              >
                {section.title}
              </TableHead>
            </TableRow>
            {/* Column names, written upwards; two-layer columns name both layers. */}
            <TableRow className="bg-muted/40 align-bottom hover:bg-muted/40">
              {section.columns.map((column) =>
                column.kind === "fixed" ? (
                  <TableHead
                    className={cn(
                      "h-auto border-border border-r p-0 align-bottom",
                      columnWidth(column)
                    )}
                    key={column.id}
                  >
                    <div className="flex h-full flex-col">
                      <VerticalName muted>Indicator</VerticalName>
                    </div>
                  </TableHead>
                ) : (
                  <TableHead
                    className={cn(
                      "h-auto border-border border-r p-0 align-bottom",
                      columnWidth(column)
                    )}
                    key={column.id}
                  >
                    <div className="flex h-full flex-col">
                      {column.upperLabel ? (
                        <>
                          <div className="flex flex-1 flex-col border-border border-b">
                            <VerticalName half>
                              {column.upperLabel}
                            </VerticalName>
                          </div>
                          <VerticalName half>{column.label}</VerticalName>
                        </>
                      ) : (
                        <VerticalName>{column.label}</VerticalName>
                      )}
                    </div>
                  </TableHead>
                )
              )}
            </TableRow>
            {/* WMO codes, each in its own cell. */}
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {section.columns.map((column) =>
                column.kind === "fixed" ? (
                  <TableHead
                    className="h-9 border-border border-t border-r p-0"
                    key={column.id}
                  />
                ) : (
                  <TableHead
                    className="h-9 whitespace-normal break-all border-border border-t border-r px-0.5 text-center font-mono font-normal text-[10px] text-muted-foreground leading-tight"
                    key={column.id}
                  >
                    {column.code}
                  </TableHead>
                )
              )}
            </TableRow>
            {/* Paper column numbers. */}
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {section.columns.map((column) => (
                <TableHead
                  className="h-6 border-border border-t border-r p-0 text-center font-mono font-normal text-[10px] text-muted-foreground"
                  key={column.kind === "fixed" ? column.id : column.id}
                >
                  {column.no ?? ""}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Upper layer: plain readings calculated from the codes below. */}
            <TableRow className="hover:bg-transparent">
              {section.columns.map((column) => {
                if (column.kind === "fixed") {
                  // Indicator digits sit in the lower layer only.
                  return (
                    <TableCell
                      className="h-6 border-border border-r p-0"
                      key={column.id}
                    />
                  );
                }
                if (column.upper) {
                  return (
                    <TableCell
                      aria-label={renderValue ? undefined : column.upper.label}
                      className={cn(
                        "h-9",
                        cellClass,
                        renderValue ? "p-0" : "px-1"
                      )}
                      key={column.id}
                    >
                      {renderValue
                        ? renderValue(column, "upper")
                        : values[column.upper.key] || ""}
                    </TableCell>
                  );
                }
                const reading =
                  column.signed?.role === "sign"
                    ? undefined
                    : READINGS[column.key];
                const text = reading ? reading(values) : "";
                return (
                  <TableCell
                    className="h-6 border-border border-r border-b bg-muted/30 px-0.5 text-center font-mono text-caption text-muted-foreground tabular-nums"
                    key={column.id}
                    title={text === null ? "Not a valid code" : undefined}
                  >
                    {text === null ? "—" : text}
                  </TableCell>
                );
              })}
            </TableRow>
            {/* Lower layer: the coded entry. */}
            <TableRow className="hover:bg-transparent">
              {section.columns.map((column) => {
                if (column.kind === "fixed") {
                  return (
                    <TableCell
                      className="h-9 border-border border-r bg-muted px-0 text-center font-mono font-semibold text-body-sm text-muted-foreground"
                      key={column.id}
                    >
                      {column.text}
                    </TableCell>
                  );
                }
                return (
                  <TableCell
                    aria-label={renderValue ? undefined : column.label}
                    className={cn(
                      "h-9",
                      cellClass,
                      renderValue ? "p-0" : "px-0.5"
                    )}
                    key={column.id}
                  >
                    {renderValue
                      ? renderValue(column, "lower")
                      : cellValue(column, values, leads) || "—"}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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
