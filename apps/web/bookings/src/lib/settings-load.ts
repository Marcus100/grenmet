import "server-only";

import type {
  BookingClosurePublic,
  BookingExceptionPublic,
  BookingMyOrganisation,
  BookingProviderSettings,
  BookingSettings,
} from "@barrelsgd/api-client";
import { ResponseError } from "@barrelsgd/api-client";
import { redirect } from "next/navigation";
import { reportError } from "@/lib/report-error";
import type { StudioSession } from "@/lib/session";
import { getSettings, listClosures, listExceptions } from "@/lib/studio-api";
import type { StudioFailure } from "@/lib/studio-errors";
import { guarded, loadOrganisation } from "@/lib/studio-page";

/** What a settings page needs to show before it can draw anything. */
export type SettingsLoad =
  | {
      ok: true;
      org: BookingMyOrganisation;
      data: BookingSettings;
    }
  | {
      ok: false;
      failure: StudioFailure;
      backHref: string;
      backLabel?: string;
    };

/**
 * The organisation and its booking settings for a settings-style page
 * (Settings, Services, People). A failure says where to go back to.
 */
export async function loadSettings(
  session: StudioSession,
  orgSlug: string,
  here: string
): Promise<SettingsLoad> {
  const org = await loadOrganisation(session, orgSlug, here);
  if (!org.ok) {
    return { ok: false, failure: org.failure, backHref: "/studio" };
  }
  const settings = await guarded(
    () => getSettings(session.accessToken, org.value.id),
    here
  );
  if (!settings.ok) {
    return {
      ok: false,
      failure: settings.failure,
      backHref: `/studio/${orgSlug}/agenda`,
      backLabel: "Back to the agenda",
    };
  }
  return { ok: true, org: org.value, data: settings.value };
}

/**
 * Time off that is still running or still to come, keyed by provider id. One
 * request per provider (the API has no organisation-wide list). A failure only
 * blanks that provider's Time off; the rest of the page stays usable.
 */
export async function loadTimeOffByProvider(
  session: StudioSession,
  organisationId: string,
  providers: BookingProviderSettings[],
  returnTo: string
): Promise<Map<string, BookingExceptionPublic[] | null>> {
  const startsFrom = new Date().toISOString();
  const entries = await Promise.all(
    providers.map(
      async (item) =>
        [
          item.id,
          await loadTimeOff(
            session.accessToken,
            organisationId,
            item.id,
            startsFrom,
            returnTo
          ),
        ] as const
    )
  );
  return new Map(entries);
}

/**
 * One provider's time off, or null when it cannot be read. A 401 goes to
 * sign-in. Any other API refusal is the person's problem to retry and is not
 * reported; a server fault or a non-API error is reported, then the section
 * says it could not be loaded.
 */
async function loadTimeOff(
  accessToken: string,
  organisationId: string,
  providerId: string,
  startsFrom: string,
  returnTo: string
): Promise<BookingExceptionPublic[] | null> {
  try {
    return await listExceptions(
      accessToken,
      organisationId,
      providerId,
      startsFrom
    );
  } catch (error) {
    readFailed(error, returnTo);
    return null;
  }
}

/**
 * The business's closed days (every provider), earliest first, or null when they
 * cannot be read. The API lists every closure the business has had, so the page
 * asks for the largest page it allows; the section drops the past ones.
 */
export async function loadClosures(
  session: StudioSession,
  organisationId: string,
  returnTo: string
): Promise<BookingClosurePublic[] | null> {
  try {
    return await listClosures(
      session.accessToken,
      organisationId,
      CLOSURES_PAGE_SIZE
    );
  } catch (error) {
    readFailed(error, returnTo);
    return null;
  }
}

/** The API's largest page (`size` is 1 to 1000). */
const CLOSURES_PAGE_SIZE = 1000;

/** A 401 goes to sign-in; a server fault or a non-API error is reported. Other refusals are not. */
function readFailed(error: unknown, returnTo: string): void {
  if (ResponseError.is(error) && error.status === 401) {
    redirect(`/signin?${new URLSearchParams({ returnTo })}`);
  }
  const clientRefusal =
    ResponseError.is(error) && error.status >= 400 && error.status < 500;
  if (!clientRefusal) {
    reportError(error, "studio");
  }
}
