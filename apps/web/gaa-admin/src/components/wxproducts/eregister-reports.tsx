"use client";

import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@barrelsgd/ui/components/ui/tabs";
import { cn } from "@barrelsgd/ui/lib/utils";
import { useState } from "react";
import { GRID_CELL, HEAD_ROW, SectionCard } from "./eregister-ui";

export interface ReportRow {
  id: string;
  message: string;
  observed: string;
}

export type ReportKind = "SYNOP" | "METAR" | "SPECI";

const KINDS: readonly ReportKind[] = ["SYNOP", "METAR", "SPECI"];

function ReportPanel({
  kind,
  rows,
  sample,
}: {
  kind: ReportKind;
  rows: readonly ReportRow[];
  sample: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const latest = rows[0];

  if (!latest) {
    return (
      <p className="px-4 py-3 text-muted-foreground text-sm" role="status">
        No {kind} reports recorded.
      </p>
    );
  }

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        <span>Latest · {latest.observed} UTC</span>
        <Badge variant="secondary">{sample ? "Sample data" : "Recorded"}</Badge>
      </div>
      <code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-muted px-3 py-2.5 font-mono text-sm tabular-nums">
        {latest.message}
      </code>
      {rows.length > 1 && (
        <Button
          aria-expanded={showAll}
          onClick={() => setShowAll((current) => !current)}
          size="sm"
          variant="outline"
        >
          {showAll ? "Hide history" : `View all (${rows.length})`}
        </Button>
      )}
      {showAll && (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className={HEAD_ROW}>
                <TableHead className={cn(GRID_CELL, "px-3.5")}>
                  Observed (UTC)
                </TableHead>
                <TableHead className="px-3.5">{kind} message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell
                    className={cn(GRID_CELL, "px-3.5 font-medium tabular-nums")}
                  >
                    {row.observed}
                  </TableCell>
                  <TableCell className="px-3.5 font-mono text-muted-foreground text-xs tabular-nums">
                    {row.message}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function LatestReports({
  reports,
  sample,
}: {
  reports: Record<ReportKind, readonly ReportRow[]>;
  sample: boolean;
}) {
  return (
    <SectionCard title="Latest Reports">
      <Tabs defaultValue="SYNOP">
        <TabsList className="mx-4 mt-3">
          {KINDS.map((kind) => (
            <TabsTrigger key={kind} value={kind}>
              {kind}
            </TabsTrigger>
          ))}
        </TabsList>
        {KINDS.map((kind) => (
          <TabsContent key={kind} value={kind}>
            <ReportPanel kind={kind} rows={reports[kind]} sample={sample} />
          </TabsContent>
        ))}
      </Tabs>
    </SectionCard>
  );
}
