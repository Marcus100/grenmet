/** Steps of the superuser invitation: send a code, enter it, then done (ADR-0059). */
export type InviteStep = "send" | "code" | "done";

export interface InviteState {
  error: string | null;
  /** The API wants the invitee's authenticator code too (an existing verified account). */
  needsTotp: boolean;
  /** A neutral confirmation, e.g. after a new code was requested. */
  notice: string | null;
  step: InviteStep;
}

export const INITIAL_INVITE_STATE: InviteState = {
  error: null,
  notice: null,
  needsTotp: false,
  step: "send",
};

/** Longest value the form will send for an authenticator or recovery code. */
export const MAX_CODE_LENGTH = 64;

const TOKEN_PARAM = /(?:^#|&)token=([^&]+)/u;
const MIN_TOKEN = 32;
const MAX_TOKEN = 256;

/**
 * The invitation token from the link's fragment (`/superuser-invite#token=...`). The
 * fragment never reaches the server or a referrer. Returns null for a missing or
 * malformed token.
 */
export function readInviteToken(hash: string): string | null {
  const match = TOKEN_PARAM.exec(hash);
  if (!match?.[1]) return null;
  let token: string;
  try {
    token = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return token.length >= MIN_TOKEN && token.length <= MAX_TOKEN ? token : null;
}
