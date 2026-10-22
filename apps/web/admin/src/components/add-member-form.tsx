"use client";

import { useState } from "react";

const FIELD = "min-h-11 rounded-md border bg-background px-2.5 py-1.5";
const BUTTON = "min-h-11 rounded-md border px-3 py-1.5 text-sm hover:bg-muted";

/**
 * Add a person to the organisation. Client-side only for "Add myself", which
 * fills the signed-in superuser's email; the form still posts to a server action.
 */
export function AddMemberForm({
  action,
  organisationId,
  roles,
  selfEmail,
}: {
  action: (formData: FormData) => Promise<never>;
  organisationId: string;
  roles: readonly string[];
  selfEmail: string;
}) {
  const [user, setUser] = useState("");
  return (
    <form
      action={action}
      aria-label="Add member"
      className="grid max-w-md gap-3 rounded-md border p-3"
    >
      <h3 className="font-medium text-sm">Add member</h3>
      <p className="text-muted-foreground text-xs">
        Needs two-step verification on your account. Admin and owner roles need
        a verified or administrator-activated person. The use is recorded with
        your reason.
      </p>
      <input name="organisation_id" type="hidden" value={organisationId} />
      <label className="grid gap-1 text-sm">
        Email or account id
        <input
          autoComplete="off"
          className={FIELD}
          name="user"
          onChange={(event) => setUser(event.target.value)}
          required
          value={user}
        />
      </label>
      <div>
        <button
          className={BUTTON}
          onClick={() => setUser(selfEmail)}
          type="button"
        >
          Add myself
        </button>
      </div>
      <label className="grid gap-1 text-sm">
        Role
        <select className={FIELD} defaultValue="member" name="role" required>
          {roles.map((role) => (
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
          rows={3}
        />
      </label>
      <div>
        <button className={BUTTON} type="submit">
          Add member
        </button>
      </div>
    </form>
  );
}
