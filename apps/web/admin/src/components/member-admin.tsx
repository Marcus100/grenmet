import {
  addMemberAction,
  changeMemberRoleAction,
  removeMemberAction,
} from "@/app/(console)/organisations/member-actions";
import { MEMBER_ROLES } from "@/lib/member-form";
import { AddMemberForm } from "./add-member-form";

const FIELD = "min-h-11 rounded-md border bg-background px-2.5 py-1.5";
const BUTTON = "min-h-11 rounded-md border px-3 py-1.5 text-sm hover:bg-muted";
const DANGER =
  "min-h-11 rounded-md border border-destructive px-3 py-1.5 text-destructive text-sm hover:bg-muted";

export interface ManagedMember {
  email: string;
  full_name: string;
  membership_id: string;
  role: string;
}

/** Add form for the roster; the client part only prefills "Add myself". */
export function MemberAddSection({
  organisationId,
  selfEmail,
}: {
  organisationId: string;
  selfEmail: string;
}) {
  return (
    <AddMemberForm
      action={addMemberAction}
      organisationId={organisationId}
      roles={MEMBER_ROLES}
      selfEmail={selfEmail}
    />
  );
}

/** Change-role and remove controls for one roster row. Plain forms, no client state. */
export function MemberRowActions({
  member,
  organisationId,
}: {
  member: ManagedMember;
  organisationId: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <details className="rounded-md border p-2">
        <summary className="min-h-11 cursor-pointer text-sm leading-[2.75rem]">
          Change role
          <span className="sr-only"> for {member.email}</span>
        </summary>
        <form action={changeMemberRoleAction} className="mt-2 grid gap-2">
          <input name="organisation_id" type="hidden" value={organisationId} />
          <input
            name="membership_id"
            type="hidden"
            value={member.membership_id}
          />
          <label className="grid gap-1 text-sm">
            New role
            <select
              className={FIELD}
              defaultValue={member.role}
              name="role"
              required
            >
              {MEMBER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Reason (10 to 500 characters)
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
              Change role
            </button>
          </div>
        </form>
      </details>
      <details className="rounded-md border p-2">
        <summary className="min-h-11 cursor-pointer text-sm leading-[2.75rem]">
          Remove
          <span className="sr-only"> {member.email}</span>
        </summary>
        <form action={removeMemberAction} className="mt-2 grid gap-2">
          <input name="organisation_id" type="hidden" value={organisationId} />
          <input
            name="membership_id"
            type="hidden"
            value={member.membership_id}
          />
          <p className="text-muted-foreground text-xs">
            Ends {member.email}&apos;s membership. The last owner cannot be
            removed.
          </p>
          <label className="grid gap-1 text-sm">
            Reason (10 to 500 characters)
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
            <button className={DANGER} type="submit">
              Remove member
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
