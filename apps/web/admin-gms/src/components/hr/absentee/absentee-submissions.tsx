"use client";

import {
  readAbsenteeReportsApiV1HrAbsenteeReportsGetQueryKey,
  useDeleteAbsenteeReportApiV1HrAbsenteeReportsAbsenteeReportIdDelete,
  useReadAbsenteeReportsApiV1HrAbsenteeReportsGet,
} from "@grenmet/api-client";
import { useSessionUser } from "@grenmet/auth";
import { Badge } from "@grenmet/ui/components/ui/badge";
import { Button } from "@grenmet/ui/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  DRAFT: "outline",
  SUBMITTED: "outline",
  APPROVED: "default",
  REJECTED: "secondary",
  CANCELLED: "secondary",
};

export function AbsenteeSubmissions() {
  const query = useReadAbsenteeReportsApiV1HrAbsenteeReportsGet();
  const queryClient = useQueryClient();
  const sessionUser = useSessionUser();
  const deleteMutation =
    useDeleteAbsenteeReportApiV1HrAbsenteeReportsAbsenteeReportIdDelete();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const reports = query.data?.data ?? [];

  async function remove(id: string) {
    setPendingId(id);
    try {
      await deleteMutation.mutateAsync({ absentee_report_id: id });
      await queryClient.invalidateQueries({
        queryKey: readAbsenteeReportsApiV1HrAbsenteeReportsGetQueryKey(),
      });
      toast.success("Draft deleted");
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(`Delete failed: ${detail}`);
    } finally {
      setPendingId(null);
    }
  }

  if (query.isLoading || reports.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 className="font-medium text-lg">My absentee reports</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Date</th>
              <th className="py-1.5 pr-3 font-medium">Reason</th>
              <th className="py-1.5 pr-3 font-medium">Notes</th>
              <th className="py-1.5 pr-3 font-medium">Status</th>
              <th className="py-1.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => {
              const isOwnedDraft =
                report.status === "DRAFT" &&
                report.submitted_by_user_id === sessionUser.id;
              return (
                <tr className="border-border border-t" key={report.id}>
                  <td className="py-1.5 pr-3">{report.report_date}</td>
                  <td className="py-1.5 pr-3">{report.reason}</td>
                  <td className="py-1.5 pr-3">{report.notes || "—"}</td>
                  <td className="py-1.5 pr-3">
                    <Badge variant={STATUS_VARIANT[report.status] ?? "outline"}>
                      {report.status}
                    </Badge>
                  </td>
                  <td className="py-1.5 text-right">
                    {isOwnedDraft ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          render={
                            <Link href={`/hr/absentee?draft=${report.id}`} />
                          }
                          size="sm"
                          variant="ghost"
                        >
                          <Pencil data-icon="inline-start" />
                          Edit
                        </Button>
                        <Button
                          disabled={pendingId === report.id}
                          onClick={() => remove(report.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 data-icon="inline-start" />
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
