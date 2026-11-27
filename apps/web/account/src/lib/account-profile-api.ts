import "server-only";

import {
  type AccountProfilePublic,
  type AccountProfileUpdate,
  accountProfilePublicSchema,
} from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "@/lib/auth-config";

const PROFILE_PATH = "/auth/users/me/profile";
const parser = {
  parse: (payload: unknown) => accountProfilePublicSchema.parse(payload),
};

/**
 * The signed-in person's own name, email and phone, read on the server with
 * their app token. Any failure throws; the caller decides what to show.
 */
export function getMyProfile(
  accessToken: string
): Promise<AccountProfilePublic> {
  return authApiFetch(getAuthConfig(), PROFILE_PATH, parser, { accessToken });
}

/** Save the fields that are sent; a field left out is not changed. */
export function updateMyProfile(
  accessToken: string,
  body: AccountProfileUpdate
): Promise<AccountProfilePublic> {
  return authApiFetch(getAuthConfig(), PROFILE_PATH, parser, {
    accessToken,
    body,
    method: "PATCH",
  });
}
