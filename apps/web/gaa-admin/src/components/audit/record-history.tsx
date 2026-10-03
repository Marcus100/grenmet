"use client";

import {
  type AuditEntryPublic,
  useAuditGetHistory,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@barrelsgd/ui/components/ui/dialog";
import { format } from "date-fns";
import { EyeOff, History } from "lucide-react";

const ACTION_LABEL: Record<string, string> = {
  create: "Created",
  update: "Changed",
  delete: "Deleted",
  archive: "Archived",
};

// Columns that only link rows together; they mean nothing to a reader.
const ID_SUFFIX = /_id$/;
const HIDDEN_FIELDS = new Set(["id", "workflow_instance_id", "object_key"]);

export function fieldLabel(field: string): string {
  const words = field.replace(ID_SUFFIX, "").replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function display(value: AuditEntryPublic["changes"][number]["new"]): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}

function Entry({ entry }: { readonly entry: AuditEntryPublic }) {
  const changes = entry.changes.filter((c) => !HIDDEN_FIELDS.has(c.field));
  return (
    <li className="flex flex-col gap-2 border-border border-l-2 pl-4">
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium">
          {ACTION_LABEL[entry.action] ?? entry.action} {entry.record_label}
        </span>
        <span className="text-muted-foreground">
          by {entry.actor_name} ·{" "}
          {format(new Date(entry.created_at), "d MMM yyyy, HH:mm")}
        </span>
      </div>
      {changes.length > 0 && entry.action === "update" ? (
        <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          {changes.map((change) => (
            <div className="contents" key={change.field}>
              <dt className="text-muted-foreground">
                {fieldLabel(change.field)}
              </dt>
              <dd className="min-w-0 break-words">
                {change.masked ? (
                  <Badge variant="outline">
                    <EyeOff data-icon="inline-start" />
                    Hidden
                  </Badge>
                ) : (
                  <>
                    <span className="text-muted-foreground line-through">
                      {display(change.old)}
                    </span>{" "}
                    → {display(change.new)}
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  );
}

/**
 * Change history of one record (or subject, e.g. an employee). Shows only what
 * the API returns: it applies the record's own read access and masks sensitive
 * values for readers without audit.view_sensitive.
 */
export function RecordHistory({
  entityType,
  entityId,
}: {
  readonly entityType: string;
  readonly entityId: string;
}) {
  const query = useAuditGetHistory({
    path: { entity_type: entityType, entity_id: entityId },
    query: { size: 50 },
  });

  if (query.isLoading) {
    return <p className="text-muted-foreground text-sm">Loading history…</p>;
  }
  if (query.isError) {
    return (
      <p className="text-destructive text-sm">
        History is not available for this record.
      </p>
    );
  }
  const entries = query.data?.data ?? [];
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No changes recorded yet. History starts from when change tracking was
        switched on.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-4">
      {entries.map((entry) => (
        <Entry entry={entry} key={entry.id} />
      ))}
    </ol>
  );
}

export function RecordHistoryButton({
  entityType,
  entityId,
  title = "Change history",
}: {
  readonly entityType: string;
  readonly entityId: string;
  readonly title?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm" type="button" variant="ghost">
            <History data-icon="inline-start" />
            History
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Who changed what, and when. Newest first.
          </DialogDescription>
        </DialogHeader>
        <RecordHistory entityId={entityId} entityType={entityType} />
      </DialogContent>
    </Dialog>
  );
}
