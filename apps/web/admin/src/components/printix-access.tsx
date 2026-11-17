import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import {
  addPrintixMemberAction,
  setPrintixAccessAction,
} from "@/app/(console)/organisations/printix-actions";
import {
  PRINTIX_ACCESS_LABELS,
  type PrintixAccessValue,
} from "@/lib/printix-form";

const FIELD = "min-h-11 rounded-md border bg-background px-2.5 py-1.5";
const BUTTON = "min-h-11 rounded-md border px-3 py-1.5 text-sm hover:bg-muted";

export interface PrintixMemberRow {
  access: string;
  can_sign_in: boolean;
  email: string;
  full_access: boolean;
  full_name: string;
  membership_id: string;
  role: string;
}

const REASON_LABEL = "Reason (10 to 500 characters)";

function AccessForm({
  member,
  organisationId,
}: {
  member: PrintixMemberRow;
  organisationId: string;
}) {
  return (
    <form action={setPrintixAccessAction} className="grid gap-2">
      <input name="organisation_id" type="hidden" value={organisationId} />
      <input name="membership_id" type="hidden" value={member.membership_id} />
      <label className="grid gap-1 text-sm">
        <span className="sr-only">Printix access for {member.email}</span>
        <select
          className={FIELD}
          defaultValue={member.full_access ? "organiser" : member.access}
          name="access"
          required
        >
          {(Object.keys(PRINTIX_ACCESS_LABELS) as PrintixAccessValue[])
            .filter((value) => !(member.full_access && value === "none"))
            .map((value) => (
              <option key={value} value={value}>
                {PRINTIX_ACCESS_LABELS[value]}
              </option>
            ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        {REASON_LABEL}
        <textarea
          className={FIELD}
          maxLength={500}
          minLength={10}
          name="reason"
          required
          rows={2}
        />
      </label>
      <div>
        <button className={BUTTON} type="submit">
          Save access
          <span className="sr-only"> for {member.email}</span>
        </button>
      </div>
    </form>
  );
}

function statusText(member: PrintixMemberRow): string {
  if (member.full_access) {
    return member.can_sign_in
      ? "Full access (owner or admin)"
      : "Full access (owner or admin), cannot sign in yet";
  }
  if (member.access === "none") return PRINTIX_ACCESS_LABELS.none;
  return PRINTIX_ACCESS_LABELS[member.access as PrintixAccessValue];
}

/**
 * Printix onboarding for one organisation: who has which Printix access, a form
 * to change it, and a form to add a person. Plain forms posting to server
 * actions, no client state. Shown only when the organisation has Printix on.
 */
export function PrintixAccessPanel({
  count,
  notice,
  organisationId,
  rows,
}: {
  count: number;
  notice?: { text: string; tone: string };
  organisationId: string;
  rows: PrintixMemberRow[];
}) {
  return (
    <section aria-labelledby="printix-heading" className="space-y-2">
      <h2 className="font-medium" id="printix-heading">
        Printix access ({count})
      </h2>
      <p className="text-muted-foreground text-xs">
        Organisers set up events, import tickets and make gate QR codes. Gate
        leads only make and cancel gate QR codes. Giving access also lets the
        person sign in to the Printix app; taking away their last access removes
        that. They still add an authenticator in their Barrels account before
        signing in at scan.barrels.gd/organiser.
      </p>
      {notice ? (
        <p
          className="rounded-md border px-3 py-2 text-sm"
          role={notice.tone === "problem" ? "alert" : "status"}
        >
          {notice.tone === "problem" ? "Problem: " : "Done: "}
          {notice.text}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          No active members.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Printix access</TableHead>
              <TableHead>Sign-in</TableHead>
              <TableHead>Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.membership_id}>
                <TableCell>{row.full_name}</TableCell>
                <TableCell>{row.email}</TableCell>
                <TableCell>{statusText(row)}</TableCell>
                <TableCell>
                  {row.can_sign_in ? "Can sign in" : "Cannot sign in"}
                </TableCell>
                <TableCell>
                  <AccessForm member={row} organisationId={organisationId} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {count > rows.length ? (
        <p className="text-muted-foreground text-xs">
          Showing the first {rows.length} members.
        </p>
      ) : null}
      <form
        action={addPrintixMemberAction}
        aria-label="Add person to Printix"
        className="grid max-w-md gap-3 rounded-md border p-3"
      >
        <h3 className="text-sm font-medium">Add person to Printix</h3>
        <p className="text-muted-foreground text-xs">
          Needs two-step verification on your account. The person must already
          have a Barrels account. They join as a member with the access below.
          The use is recorded with your reason.
        </p>
        <input name="organisation_id" type="hidden" value={organisationId} />
        <label className="grid gap-1 text-sm">
          Email or account id
          <input autoComplete="off" className={FIELD} name="user" required />
        </label>
        <label className="grid gap-1 text-sm">
          Printix access
          <select
            className={FIELD}
            defaultValue="organiser"
            name="access"
            required
          >
            <option value="organiser">{PRINTIX_ACCESS_LABELS.organiser}</option>
            <option value="gate_lead">{PRINTIX_ACCESS_LABELS.gate_lead}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          {REASON_LABEL}
          <textarea
            className={FIELD}
            maxLength={500}
            minLength={10}
            name="reason"
            required
            rows={3}
          />
        </label>
        <div>
          <button className={BUTTON} type="submit">
            Add to Printix
          </button>
        </div>
      </form>
    </section>
  );
}
