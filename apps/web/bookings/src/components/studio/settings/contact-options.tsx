"use client";

import type { BookingProfilePublic } from "@barrelsgd/api-client";
import { Input } from "@barrelsgd/ui/components/ui/input";
import type { ContactFieldErrors } from "@/lib/business-contact";
import { INPUT, SettingsField } from "./settings-ui";

/**
 * The four optional ways customers can reach the business. The public booking
 * page shows only the ones filled in ("Questions? Contact us", and in messages
 * that tell people to contact the business).
 */
export function ContactOptions({
  errors,
  profile,
}: {
  errors?: ContactFieldErrors | undefined;
  profile: BookingProfilePublic | null;
}) {
  return (
    <fieldset className="border-border space-y-4 border-t pt-4">
      <legend className="pt-4 font-medium">
        Contact options for customers
      </legend>
      <p className="text-muted-foreground text-sm" id="profile-contact-intro">
        Shown on your booking page so customers can ask a question or change a
        booking that can no longer be changed online. Fill in only the ones you
        use; empty ones are not shown.
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        <SettingsField
          error={errors?.contactPhone}
          hint="Customers can tap it to call. Include the country code, for example +1 473 440 1234."
          id="profile-contactPhone"
          label="Phone (optional)"
        >
          {(describedBy) => (
            <Input
              aria-describedby={describedBy}
              aria-invalid={errors?.contactPhone ? true : undefined}
              autoComplete="off"
              className={INPUT}
              defaultValue={profile?.contact_phone ?? ""}
              id="profile-contactPhone"
              inputMode="tel"
              maxLength={40}
              name="contactPhone"
              type="tel"
            />
          )}
        </SettingsField>
        <SettingsField
          error={errors?.contactWhatsapp}
          hint="The number you use on WhatsApp, with the country code."
          id="profile-contactWhatsapp"
          label="WhatsApp (optional)"
        >
          {(describedBy) => (
            <Input
              aria-describedby={describedBy}
              aria-invalid={errors?.contactWhatsapp ? true : undefined}
              autoComplete="off"
              className={INPUT}
              defaultValue={
                profile?.contact_whatsapp ? `+${profile.contact_whatsapp}` : ""
              }
              id="profile-contactWhatsapp"
              inputMode="tel"
              maxLength={40}
              name="contactWhatsapp"
              type="tel"
            />
          )}
        </SettingsField>
        <SettingsField
          error={errors?.contactInstagram}
          hint="Your handle, like @yourbusiness, or your instagram.com profile address."
          id="profile-contactInstagram"
          label="Instagram (optional)"
        >
          {(describedBy) => (
            <Input
              aria-describedby={describedBy}
              aria-invalid={errors?.contactInstagram ? true : undefined}
              autoCapitalize="none"
              autoComplete="off"
              className={INPUT}
              defaultValue={
                profile?.contact_instagram
                  ? `@${profile.contact_instagram}`
                  : ""
              }
              id="profile-contactInstagram"
              maxLength={200}
              name="contactInstagram"
              spellCheck={false}
            />
          )}
        </SettingsField>
        <SettingsField
          error={errors?.contactEmail}
          hint="An address customers can write to. It can differ from the notification email."
          id="profile-contactEmail"
          label="Email (optional)"
        >
          {(describedBy) => (
            <Input
              aria-describedby={describedBy}
              aria-invalid={errors?.contactEmail ? true : undefined}
              autoComplete="off"
              className={INPUT}
              defaultValue={profile?.contact_email ?? ""}
              id="profile-contactEmail"
              inputMode="email"
              maxLength={254}
              name="contactEmail"
              type="email"
            />
          )}
        </SettingsField>
      </div>
    </fieldset>
  );
}
