import type { Metadata } from "next";
import { AccountNav } from "@/components/account-nav";
import { PhoneForm } from "@/components/profile-checklist/phone-form";
import { getMyProfile } from "@/lib/account-profile-api";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Phone number" };

/**
 * The phone editor of "Finish your profile". A profile that cannot be read
 * throws to the error page: an empty field would read as "remove my number".
 */
export default async function ProfilePhonePage() {
  const session = await requireSession("/profile/phone");
  const profile = await getMyProfile(session.accessToken);

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6"
      id="main-content"
    >
      <AccountNav current="profile" />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Phone number</h1>
        <p className="text-muted-foreground">
          A business can use it to reach you about a booking.
        </p>
      </header>
      <PhoneForm phone={profile.phone ?? ""} />
    </main>
  );
}
