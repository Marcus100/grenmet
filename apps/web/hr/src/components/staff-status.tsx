import { Badge } from "@barrelsgd/ui/components/ui/badge";

/**
 * Status words for the staff status the API returns. The tone is a text badge,
 * so the state is never carried by colour alone.
 */
const STATUS: Record<
  string,
  {
    label: string;
    variant: "solid-success" | "solid-warning" | "solid-light";
  }
> = {
  active: { label: "Active", variant: "solid-success" },
  pending: { label: "Pending", variant: "solid-warning" },
  inactive: { label: "Inactive", variant: "solid-light" },
};

const UNKNOWN_STATUS = {
  label: "Status not recognised",
  variant: "solid-light",
} as const;

export function StaffStatusBadge({ status }: { status: string }) {
  const badge = STATUS[status] ?? UNKNOWN_STATUS;
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

/** One label and value pair in a staff record. */
export function StaffFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1 text-sm">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd>{value}</dd>
    </div>
  );
}
