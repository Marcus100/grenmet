"use client";

import type { RoleBundlePublic } from "@barrelsgd/api-client";
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
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import { SIGN_IN_REQUIRED } from "@/data/action-result";
import { grantRole } from "@/data/team-actions";
import {
  allowedActions,
  bundleCopy,
  COULDNT_CONFIRM_TEAM,
  expiryFromDate,
} from "@/lib/team-roles";
import { useHydrated } from "@/lib/use-hydrated";
import { useTeamFeedback } from "./team-feedback";

function unavailableReason(
  bundle: RoleBundlePublic,
  already: boolean
): string | null {
  if (already) {
    return "They already have this role.";
  }
  return bundle.grantable
    ? null
    : "You can't give this role because you don't hold it yourself.";
}

/**
 * Give a member a role. Step one picks the bundle and an optional end date;
 * step two says what the role allows and asks to confirm. Every typed value
 * lives in this component (outside the dialog content), so a refusal, a
 * closed dialog or a failed request keeps what was chosen.
 */
export function GrantRoleDialog({
  bundles,
  heldRoleKeys,
  memberName,
  membershipId,
  today,
}: {
  bundles: readonly RoleBundlePublic[];
  /** Role keys the member already holds (live), so they are not offered twice. */
  heldRoleKeys: readonly string[];
  memberName: string;
  membershipId: string;
  /** Today in UTC as YYYY-MM-DD, from the server, so the date field's minimum matches. */
  today: string;
}) {
  const router = useRouter();
  const feedback = useTeamFeedback();
  const hydrated = useHydrated();
  const { pending, perform } = useMemberAction(COULDNT_CONFIRM_TEAM);
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"choose" | "confirm">("choose");
  const [roleKey, setRoleKey] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const alertRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (formError) {
      alertRef.current?.focus();
    }
  }, [formError]);

  const chosen = bundles.find((bundle) => bundle.role_key === roleKey) ?? null;

  function review() {
    if (!chosen) {
      setFormError("Choose a role to give.");
      return;
    }
    const expiry = expiryFromDate(expiresOn, new Date());
    if (!expiry.ok) {
      setFormError(expiry.error);
      return;
    }
    setFormError(null);
    setStep("confirm");
  }

  async function confirm() {
    if (!chosen) {
      return;
    }
    const result = await perform(() =>
      grantRole({ membershipId, roleKey: chosen.role_key, expiresOn })
    );
    if (result.ok) {
      setOpen(false);
      setStep("choose");
      setRoleKey("");
      setExpiresOn("");
      setFormError(null);
      feedback.notice(
        `${memberName} now has the ${bundleCopy(chosen.role_key).title} role.`
      );
      router.refresh();
      return;
    }
    if (result.error !== SIGN_IN_REQUIRED) {
      // Back to the choices with what was typed still in place.
      setFormError(result.error);
      setStep("choose");
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={<Button className="min-h-11" type="button" variant="outline" />}
      >
        Give role
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Give a role to {memberName}</DialogTitle>
          <DialogDescription>
            {step === "choose"
              ? "Pick the role and, if it should end, the day it ends."
              : "Check what this role allows before you confirm."}
          </DialogDescription>
        </DialogHeader>

        <p
          className="font-medium text-body text-destructive empty:hidden"
          ref={alertRef}
          role="alert"
          tabIndex={-1}
        >
          {formError}
        </p>

        {step === "choose" ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              review();
            }}
          >
            <fieldset className="space-y-2">
              <legend className="font-medium text-body">Role</legend>
              {bundles.length === 0 ? (
                <p className="text-body text-muted-foreground" role="status">
                  This organisation has no roles to give yet.
                </p>
              ) : null}
              {bundles.map((bundle) => {
                const copy = bundleCopy(bundle.role_key);
                const already = heldRoleKeys.includes(bundle.role_key);
                const reason = unavailableReason(bundle, already);
                return (
                  <label
                    className="flex min-h-11 items-start gap-3 rounded-xl border bg-card px-3 py-2 has-[:checked]:border-primary has-[:disabled]:opacity-60"
                    key={bundle.role_key}
                  >
                    <input
                      checked={roleKey === bundle.role_key}
                      className="mt-1 size-5 accent-primary"
                      disabled={reason !== null}
                      name={`${ids}-role`}
                      onChange={() => {
                        setRoleKey(bundle.role_key);
                        setFormError(null);
                      }}
                      type="radio"
                      value={bundle.role_key}
                    />
                    <span>
                      <span className="block font-medium text-body">
                        {copy.title}
                      </span>
                      <span className="block text-caption text-muted-foreground">
                        {copy.description}
                      </span>
                      {reason ? (
                        <span className="block text-caption text-muted-foreground">
                          {reason}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <Field>
              <FieldLabel htmlFor={`${ids}-expires`}>
                Ends on (optional)
              </FieldLabel>
              <Input
                className="min-h-11"
                id={`${ids}-expires`}
                min={today}
                onChange={(event) => {
                  setExpiresOn(event.target.value);
                  setFormError(null);
                }}
                type="date"
                value={expiresOn}
              />
              <p className="text-caption text-muted-foreground">
                The role ends at 23:59 UTC on this day (7:59 pm in Grenada).
                Leave empty for no end date.
              </p>
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
                disabled={!hydrated || bundles.length === 0}
                type="submit"
              >
                Review
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            {chosen ? (
              <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
                <p className="font-medium text-body">
                  {bundleCopy(chosen.role_key).title}
                </p>
                <p className="text-body text-muted-foreground">
                  {memberName} will be able to:
                </p>
                <ul className="list-disc space-y-1 pl-5 text-body">
                  {allowedActions(chosen.permissions).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="text-body text-muted-foreground">
                  {expiresOn
                    ? `The role ends at 23:59 UTC on ${expiresOn}.`
                    : "The role has no end date until someone takes it away."}
                </p>
              </div>
            ) : null}
            <DialogFooter>
              <Button
                className="min-h-11"
                disabled={pending}
                onClick={() => setStep("choose")}
                type="button"
                variant="outline"
              >
                Back
              </Button>
              <Button
                className="min-h-11"
                disabled={pending || !hydrated}
                onClick={confirm}
                type="button"
              >
                {pending ? "Giving role" : "Confirm and give role"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
