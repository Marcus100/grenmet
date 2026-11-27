import type {
  AccountProfilePublic,
  ProfileImagePublic,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { AccountNav } from "@/components/account-nav";
import { ProfileChecklist } from "@/components/profile-checklist/profile-checklist";
import { ProfilePhotoPanel } from "@/components/profile-photo/profile-photo-panel";
import { getMyProfile } from "@/lib/account-profile-api";
import { fullName, PROFILE_PHOTO_ANCHOR } from "@/lib/profile-checklist";
import { SAVED_NOTICES } from "@/lib/profile-form";
import { getMyProfilePhoto } from "@/lib/profile-photo-api";
import { reportError } from "@/lib/report-error";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

interface AccountHomePageProps {
  searchParams?: Promise<{ saved?: string | string[] }>;
}

/** The fixed sentence for `?saved=`; anything else shows nothing. */
function savedNotice(saved: string | string[] | undefined): string | null {
  if (typeof saved !== "string" || !Object.hasOwn(SAVED_NOTICES, saved)) {
    return null;
  }
  return SAVED_NOTICES[saved] ?? null;
}

/**
 * The signed-in person's account home: who they are, the "Finish your profile"
 * checklist and the profile photo. The profile and the photo are read here on
 * the server, each on its own: one that cannot be read is reported and does not
 * hide the rest. Only the photo upload and removal are client calls.
 */
export default async function AccountHomePage({
  searchParams,
}: AccountHomePageProps = {}) {
  const session = await requireSession("/");
  const notice = savedNotice((await searchParams)?.saved);

  const [profileRead, photoRead] = await Promise.allSettled([
    getMyProfile(session.accessToken),
    getMyProfilePhoto(session.accessToken),
  ]);

  let profile: AccountProfilePublic | null = null;
  if (profileRead.status === "fulfilled") {
    profile = profileRead.value;
  } else {
    reportError(profileRead.reason, "account-profile");
  }

  let photo: ProfileImagePublic | null = null;
  let photoUnavailable = false;
  if (photoRead.status === "fulfilled") {
    photo = photoRead.value;
  } else {
    reportError(photoRead.reason, "account-profile-photo");
    photoUnavailable = true;
  }

  // A name the sign-up made up is not shown as the person's name.
  let name = session.name;
  if (profile) name = profile.name_is_placeholder ? null : fullName(profile);

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6"
      id="main-content"
    >
      <AccountNav current="profile" />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-sm font-medium">
            Barrels account
          </p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {name ?? session.email}
          </h1>
          <p className="text-muted-foreground break-all">{session.email}</p>
        </div>
        <form action="/auth/logout" method="post">
          <Button type="submit" variant="outline">
            Sign out of this app
          </Button>
        </form>
      </header>

      {notice ? (
        <p className="text-sm font-medium" role="status">
          {notice}
        </p>
      ) : null}

      {profile ? (
        <ProfileChecklist
          hasPhoto={photoUnavailable ? null : photo !== null}
          profile={profile}
        />
      ) : (
        <section
          aria-labelledby="profile-checklist-heading"
          className="space-y-2"
        >
          <h2 className="text-lg font-semibold" id="profile-checklist-heading">
            Finish your profile
          </h2>
          <p className="text-muted-foreground text-sm" role="alert">
            We could not load your profile just now. Refresh the page to try
            again.
          </p>
        </section>
      )}

      <section
        aria-labelledby="profile-heading"
        className="scroll-mt-4 space-y-4"
        id={PROFILE_PHOTO_ANCHOR}
      >
        <h2 className="text-lg font-semibold" id="profile-heading">
          Profile photo
        </h2>
        {photoUnavailable ? (
          <p className="text-muted-foreground text-sm" role="alert">
            We could not check your current photo just now. Refresh the page to
            try again.
          </p>
        ) : null}
        <ProfilePhotoPanel
          email={session.email}
          initialPhoto={photo}
          name={name}
        />
      </section>
    </main>
  );
}
