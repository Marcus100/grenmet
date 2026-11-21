"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@barrelsgd/ui/components/ui/dialog";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { useId, useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import { inviteMember } from "@/data/team-actions";
import { useHydrated } from "@/lib/use-hydrated";
import { useTeamFeedback } from "./team-feedback";

const ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" },
] as const;

type InviteRole = (typeof ROLE_OPTIONS)[number]["value"];

const COULDNT_SEND = "We couldn't send that invitation. Try again shortly.";

/**
 * Invite someone by email to join the organisation. The API decides what the
 * caller may invite: admins invite members and admins, and only owners invite
 * owners, so the Owner choice is offered only to an owner. Refusals show the
 * API's own sentence.
 */
export function InviteMemberDialog({
  canInviteOwner,
}: {
  canInviteOwner: boolean;
}) {
  const feedback = useTeamFeedback();
  const hydrated = useHydrated();
  const { error, pending, perform } = useMemberAction(COULDNT_SEND);
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("member");

  const roles = ROLE_OPTIONS.filter(
    (option) => option.value !== "owner" || canInviteOwner
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    const result = await perform(() => inviteMember({ email: address, role }));
    if (result.ok) {
      setOpen(false);
      setEmail("");
      setRole("member");
      feedback.notice(`Invitation sent to ${address}.`);
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={<Button className="min-h-11" type="button" variant="outline" />}
      >
        Invite member
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite someone to the team</DialogTitle>
          <DialogDescription>
            We email a single-use link that works for 7 days. Inviting the same
            address again replaces the pending invitation.
          </DialogDescription>
        </DialogHeader>

        <p
          className="text-body text-destructive font-medium empty:hidden"
          role="alert"
        >
          {error}
        </p>

        <form className="space-y-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor={`${ids}-email`}>Email address</FieldLabel>
            <Input
              autoComplete="off"
              className="min-h-11"
              id={`${ids}-email`}
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-role`}>Role</FieldLabel>
            <NativeSelect
              className="w-full"
              id={`${ids}-role`}
              onChange={(event) => {
                const chosen = ROLE_OPTIONS.find(
                  (option) => option.value === event.target.value
                );
                setRole(chosen?.value ?? "member");
              }}
              value={role}
            >
              {roles.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <DialogFooter>
            <Button
              className="min-h-11"
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="min-h-11"
              disabled={pending || !hydrated}
              type="submit"
            >
              {pending ? "Sending" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
