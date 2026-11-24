"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useState } from "react";

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
      <h3 className="text-sm font-medium">Add member</h3>
      <p className="text-muted-foreground text-xs">
        Needs two-step verification on your account. Admin and owner roles need
        a verified or administrator-activated person. The use is recorded with
        your reason.
      </p>
      <input name="organisation_id" type="hidden" value={organisationId} />
      <label className="grid gap-1 text-sm">
        Email or account id
        <Input
          autoComplete="off"
          name="user"
          onChange={(event) => setUser(event.target.value)}
          required
          value={user}
        />
      </label>
      <div>
        <Button
          onClick={() => setUser(selfEmail)}
          type="button"
          variant="outline"
        >
          Add myself
        </Button>
      </div>
      <label className="grid gap-1 text-sm">
        Role
        <NativeSelect defaultValue="member" name="role" required>
          {roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="grid gap-1 text-sm">
        Reason (10 to 500 characters)
        <Textarea
          maxLength={500}
          minLength={10}
          name="reason"
          required
          rows={3}
        />
      </label>
      <div>
        <Button type="submit" variant="outline">
          Add member
        </Button>
      </div>
    </form>
  );
}
