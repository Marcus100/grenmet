import type { Metadata } from "next";
import { AccountNav } from "@/components/account-nav";
import { NameForm } from "@/components/profile-checklist/name-form";
import { getMyProfile } from "@/lib/account-profile-api";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your name" };

/**
 * The name editor of "Finish your profile". A name the sign-up made up is not
 * offered back: the fields start empty. A profile that cannot be read throws to
 * the error page, so a save never starts from the wrong values.
 */
export default async function ProfileNamePage() {
  const session = await requireSession("/profile/name");
  const profile = await getMyProfile(session.accessToken);
  const known = !profile.name_is_placeholder;

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6"
      id="main-content"
    >
      <AccountNav current="profile" />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your name</h1>
        <p className="text-muted-foreground">
          Businesses you book with see this name.
        </p>
      </header>
      <NameForm
        firstName={known ? profile.first_name : ""}
        lastName={known ? profile.last_name : ""}
      />
    </main>
  );
}
