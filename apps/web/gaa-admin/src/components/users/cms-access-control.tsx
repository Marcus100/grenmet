"use client";
import {
  authGetOnboardingStatusQueryKey,
  authGetUsersQueryKey,
  type UserPublic,
  useAuthUpdateUser,
} from "@barrelsgd/api-client";
import { useSessionUser } from "@barrelsgd/auth";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/report-error";

export function CmsAccessControl({
  user,
  open,
}: {
  user: UserPublic;
  open: boolean;
}) {
  const queryClient = useQueryClient();
  const updateUserMutation = useAuthUpdateUser();
  const actor = useSessionUser();
  const [cmsAccess, setCmsAccess] = useState<
    NonNullable<UserPublic["cms_access"]>
  >(user.cms_access ?? "none");
  const [cmsError, setCmsError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setCmsAccess(user.cms_access ?? "none");
      setCmsError(null);
    }
  }, [open, user.cms_access]);

  async function saveCmsAccess() {
    setCmsError(null);
    try {
      await updateUserMutation.mutateAsync({
        path: { user_id: user.id },
        body: { cms_access: cmsAccess },
      });
      await queryClient.invalidateQueries({
        queryKey: authGetUsersQueryKey({}),
      });
      await queryClient.invalidateQueries({
        queryKey: authGetOnboardingStatusQueryKey({
          path: { user_id: user.id },
        }),
      });
      toast.success("CMS access updated. The user must sign in to CMS again.");
    } catch (error) {
      reportError(error, "cms-access");
      setCmsError("Unable to update CMS access. Try again.");
    }
  }

  return (
    <>
      {actor?.is_superuser ? (
        <section aria-label="CMS access" className="flex flex-col gap-3">
          {user.is_superuser ? (
            <p>System administrators have full CMS access.</p>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="cms-access">CMS access</FieldLabel>
                <NativeSelect
                  id="cms-access"
                  onChange={(event) => {
                    const value = event.target.value;
                    if (
                      value === "none" ||
                      value === "writer" ||
                      value === "publisher"
                    )
                      setCmsAccess(value);
                  }}
                  value={cmsAccess}
                >
                  <option value="none">No access</option>
                  <option value="writer">Writer</option>
                  <option value="publisher">Publisher</option>
                </NativeSelect>
              </Field>
              <p className="text-muted-foreground text-sm">
                Writers create their own drafts for review. Publishers manage
                and publish all CMS content. This does not grant staff access.
              </p>
              {cmsError ? <p role="alert">{cmsError}</p> : null}
              <Button
                disabled={updateUserMutation.isPending}
                onClick={saveCmsAccess}
                type="button"
              >
                Save CMS access
              </Button>
            </>
          )}
        </section>
      ) : null}
    </>
  );
}
