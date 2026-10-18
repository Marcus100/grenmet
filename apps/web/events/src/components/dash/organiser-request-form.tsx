"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useMemberAction } from "@/components/community/use-member-action";
import { requestOrganiser } from "@/data/actions";

/**
 * Creates an organiser account owned by the member. It starts unverified;
 * a Barrels moderator reviews and verifies it.
 */
export function OrganiserRequestForm() {
  const router = useRouter();
  const { error, pending, perform } = useMemberAction();

  return (
    <form
      className="space-y-6 text-left"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const text = (key: string) => {
          const value = data.get(key);
          return typeof value === "string" ? value.trim() : "";
        };
        const result = await perform(() =>
          requestOrganiser({ name: text("name"), bio: text("bio") })
        );
        if (result.ok) {
          router.refresh();
        }
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="organiser-name">Organiser name</FieldLabel>
          <Input
            id="organiser-name"
            maxLength={80}
            minLength={2}
            name="name"
            required
          />
          <FieldDescription>
            The name on your events, for example a crew, venue or club.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="organiser-bio">About you</FieldLabel>
          <Textarea id="organiser-bio" maxLength={500} name="bio" rows={3} />
        </Field>
      </FieldGroup>
      <Button
        className="h-11 w-full"
        disabled={pending}
        size="lg"
        type="submit"
      >
        Request organiser account
      </Button>
      {error ? (
        <p className="text-body text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
