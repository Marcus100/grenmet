import type { ApiKeyPublic } from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Skeleton } from "@barrelsgd/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { revokeApiKeyAction } from "@/app/(console)/organisations/api-key-actions";
import { type KeyState, keyState } from "@/lib/api-key-form";

const DANGER =
  "rounded-md border border-destructive px-3 py-1.5 text-destructive text-sm hover:bg-muted";
const DATE_LENGTH = 10;

const STATE_BADGE: Record<
  KeyState,
  { label: string; variant: "light-success" | "light-warning" | "outline" }
> = {
  active: { label: "Active", variant: "light-success" },
  expired: { label: "Expired", variant: "light-warning" },
  revoked: { label: "Revoked", variant: "outline" },
};

function day(iso: string | null | undefined, fallback: string): string {
  return iso ? iso.slice(0, DATE_LENGTH) : fallback;
}

function KeyRow({
  now,
  organisationId,
  row,
}: {
  now: Date;
  organisationId: string;
  row: ApiKeyPublic;
}) {
  const state = keyState(row, now);
  const badge = STATE_BADGE[state];
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{row.name}</div>
        <div className="text-muted-foreground font-mono text-xs">
          {row.key_prefix}
        </div>
      </TableCell>
      <TableCell>
        {row.scopes.length > 0 ? row.scopes.join(", ") : "None"}
      </TableCell>
      <TableCell>{day(row.expires_at, "Never")}</TableCell>
      <TableCell>{day(row.last_used_at, "Never used")}</TableCell>
      <TableCell>
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {row.revoked_at ? (
          <div className="text-muted-foreground text-xs">
            {day(row.revoked_at, "")}
          </div>
        ) : null}
      </TableCell>
      <TableCell>
        {state === "revoked" ? null : (
          <details>
            <summary className="cursor-pointer text-sm">Revoke</summary>
            <form action={revokeApiKeyAction} className="mt-2 grid gap-2">
              <input
                name="organisation_id"
                type="hidden"
                value={organisationId}
              />
              <input name="key_id" type="hidden" value={row.id} />
              <p className="text-xs">
                Revoking {row.key_prefix} stops it working at once and cannot be
                undone.
              </p>
              <div>
                <button className={DANGER} type="submit">
                  Confirm revoke
                </button>
              </div>
            </form>
          </details>
        )}
      </TableCell>
    </TableRow>
  );
}

export function ApiKeysPanel({
  count,
  now,
  organisationId,
  rows,
}: {
  count: number;
  now: Date;
  organisationId: string;
  rows: ApiKeyPublic[];
}) {
  return (
    <section aria-labelledby="api-keys-heading" className="space-y-2">
      <h2 className="font-medium" id="api-keys-heading">
        API keys ({count})
      </h2>
      <p className="text-muted-foreground max-w-3xl text-sm">
        Organisation admins create and rotate keys themselves; secrets are shown
        once to them and never here. Staff can revoke.
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          This organisation has no API keys.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <KeyRow
                key={row.id}
                now={now}
                organisationId={organisationId}
                row={row}
              />
            ))}
          </TableBody>
        </Table>
      )}
      {count > rows.length ? (
        <p className="text-muted-foreground text-sm">
          Showing the first {rows.length} of {count} keys.
        </p>
      ) : null}
    </section>
  );
}

export function ApiKeysLoading() {
  return (
    <section
      aria-busy="true"
      aria-labelledby="api-keys-heading"
      className="space-y-2"
    >
      <h2 className="font-medium" id="api-keys-heading">
        API keys
      </h2>
      <Skeleton className="h-24 max-w-3xl" />
      <span className="sr-only" role="status">
        Loading API keys
      </span>
    </section>
  );
}

export function ApiKeysError() {
  return (
    <section aria-labelledby="api-keys-heading" className="space-y-2">
      <h2 className="font-medium" id="api-keys-heading">
        API keys
      </h2>
      <p className="rounded-md border px-3 py-2 text-sm" role="alert">
        Problem: the API keys could not be loaded. Reload the page to try again.
      </p>
    </section>
  );
}
