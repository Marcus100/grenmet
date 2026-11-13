import type { ProfileImagePublic } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { ProfilePhotoPanel } from "@/components/profile-photo/profile-photo-panel";
import { getMyProfilePhoto } from "@/lib/profile-photo-api";
import { reportError } from "@/lib/report-error";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The signed-in person's account home: name, email and profile photo. The
 * photo is read here on the server; only the upload and removal are client
 * calls. A photo that cannot be read is reported and does not hide the rest.
 */
export default async function AccountHomePage() {
  const session = await requireSession("/");

  let photo: ProfileImagePublic | null = null;
  let photoUnavailable = false;
  try {
    photo = await getMyProfilePhoto(session.accessToken);
  } catch (error) {
    reportError(error, "account-profile-photo");
    photoUnavailable = true;
  }

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6"
      id="main-content"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-sm font-medium">
            Barrels account
          </p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {session.name ?? session.email}
          </h1>
          <p className="text-muted-foreground break-all">{session.email}</p>
        </div>
        <form action="/auth/logout" method="post">
          <Button type="submit" variant="outline">
            Sign out of this app
          </Button>
        </form>
      </header>

      <section aria-labelledby="profile-heading" className="space-y-4">
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
          name={session.name}
        />
      </section>
    </main>
  );
}
