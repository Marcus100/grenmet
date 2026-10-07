"use client";
import {
  authGetUsersQueryKey,
  type UserPublic,
  useAuthCreateOnboardingAccount,
} from "@barrelsgd/api-client";
import { useSessionUser } from "@barrelsgd/auth";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@barrelsgd/ui/components/ui/dialog";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { reportError } from "@/lib/report-error";
import { AccountActivation } from "./account-activation";
import { CmsAccessControl } from "./cms-access-control";

export function CreateAccountDialog({
  onCreated,
}: {
  onCreated?: () => void;
} = {}) {
  const actor = useSessionUser();
  return actor?.is_superuser ? <CreateAccount onCreated={onCreated} /> : null;
}
function CreateAccount({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<UserPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = useAuthCreateOnboardingAccount();
  const queries = useQueryClient();
  async function submit(form: FormData) {
    setError(null);
    try {
      const created = await create.mutateAsync({
        body: {
          first_name: String(form.get("first_name") ?? "").trim(),
          last_name: String(form.get("last_name") ?? "").trim(),
          email: String(form.get("email") ?? "").trim(),
          username: String(form.get("username") ?? "").trim(),
        },
      });
      setUser(created);
      await queries.invalidateQueries({ queryKey: authGetUsersQueryKey({}) });
      onCreated?.();
    } catch (caught) {
      reportError(caught, "account-create");
      setError(
        "Unable to create the account. Check whether the email or username is already in use. Use Manage roles & access for an existing account."
      );
    }
  }
  return (
    <Dialog
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          setUser(null);
          setError(null);
        }
      }}
      open={open}
    >
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        New account without email
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {user
              ? `Set up ${user.first_name}'s access`
              : "Create a work account"}
          </DialogTitle>
          <DialogDescription>
            Use a separate work identity. The person chooses their own password
            through a private activation link. HR workflow setup is separate.
          </DialogDescription>
        </DialogHeader>
        {user ? (
          <>
            <AccountActivation open={open} user={user} />
            <CmsAccessControl open={open} user={user} />
            <p className="text-muted-foreground text-sm">
              You can return to this account through Users → Manage roles &
              access. Complete department and employment details there when
              staff workflows are needed.
            </p>
          </>
        ) : (
          <form action={submit} className="space-y-3">
            {(
              [
                ["first_name", "First name"],
                ["last_name", "Last name"],
                ["username", "Username"],
                ["email", "Work email address"],
              ] as const
            ).map(([name, label]) => (
              <Field key={name}>
                <FieldLabel htmlFor={`activation-${name}`}>{label}</FieldLabel>
                <Input
                  id={`activation-${name}`}
                  name={name}
                  required
                  type={name === "email" ? "email" : "text"}
                />
              </Field>
            ))}
            <p className="text-muted-foreground text-sm">
              The work email identifies the account; its inbox does not need to
              work yet.
            </p>
            <Button disabled={create.isPending} type="submit">
              Create account
            </Button>
          </form>
        )}
        {error ? <p role="alert">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
