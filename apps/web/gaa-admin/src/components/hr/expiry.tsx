import { Badge } from "@barrelsgd/ui/components/ui/badge";

export function grenadaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Grenada",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function expiryState(date: string | null | undefined, today: string) {
  if (!date) return "undated";
  const days = (Date.parse(date) - Date.parse(today)) / 86_400_000;
  if (!Number.isFinite(days)) return "undated";
  if (days < 0) return "expired";
  if (days <= 30) return "soon";
  return "current";
}

export function ExpiryBadge({
  date,
  today,
  archived = false,
}: {
  date?: string | null;
  today: string;
  archived?: boolean;
}) {
  const state = expiryState(date, today);
  if (archived) return <Badge variant="secondary">Archived</Badge>;
  const labels = {
    expired: "Expired",
    soon: date === today ? "Expires today" : "Expires within 30 days",
    current: "Current",
    undated: "No expiry date",
  };
  return (
    <Badge variant={state === "expired" ? "destructive" : "secondary"}>
      {labels[state]}
    </Badge>
  );
}

export function ExpiryFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2 text-sm">
      Expiry filter (current page)
      <select
        aria-label="Expiry filter (current page)"
        className="block rounded-md border border-input bg-background p-2"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="all">All expiry dates</option>
        <option value="expired">Expired</option>
        <option value="soon">Expires within 30 days (including today)</option>
        <option value="current">More than 30 days remaining</option>
        <option value="undated">No expiry date</option>
      </select>
    </label>
  );
}
