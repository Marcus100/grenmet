import "server-only";

import {
  type ProfileImagePublic,
  profileImagePublicSchema,
} from "@barrelsgd/api-client";
import { isAuthApiError } from "@barrelsgd/auth";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "@/lib/auth-config";

/**
 * The person's own photo, read on the server with their app token. 404 means
 * no photo (the common case, not an error). Any other failure throws; the
 * caller decides what to show, and the page reports it.
 */
export async function getMyProfilePhoto(
  accessToken: string
): Promise<ProfileImagePublic | null> {
  try {
    return await authApiFetch(
      getAuthConfig(),
      "/profile-images/me",
      { parse: (payload: unknown) => profileImagePublicSchema.parse(payload) },
      { accessToken }
    );
  } catch (error) {
    if (isAuthApiError(error) && error.status === 404) return null;
    throw error;
  }
}
