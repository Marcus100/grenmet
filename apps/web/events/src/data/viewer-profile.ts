import type { Profile } from "@/domain/types";

export const ANONYMOUS_VIEWER_ID = "anonymous";

export function isSignedIn(viewer: Profile): boolean {
  return viewer.id !== ANONYMOUS_VIEWER_ID;
}
