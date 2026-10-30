import "server-only";

import {
  createClient,
  type ProgramCreate,
  type RewardsAchievementCreate,
  type RewardsChallengeCreate,
  type RewardsTrailCreate,
  type RewardsTrailStopCreate,
  type RewardsTrailUpdate,
  rewardsConfirmRedemption,
  rewardsCreateProgram,
  rewardsListPrograms,
  rewardsOrgAddTrailStop,
  rewardsOrgCreateAchievement,
  rewardsOrgCreateChallenge,
  rewardsOrgCreateTrail,
  rewardsOrgCreateVenue,
  rewardsOrgGetVenueQrToken,
  rewardsOrgListAchievements,
  rewardsOrgListChallenges,
  rewardsOrgListEntries,
  rewardsOrgListRedemptions,
  rewardsOrgListTrails,
  rewardsOrgListVenues,
  rewardsOrgPauseChallenge,
  rewardsOrgPauseProgram,
  rewardsOrgResumeChallenge,
  rewardsOrgResumeProgram,
  rewardsOrgUpdateTrail,
} from "@barrelsgd/api-client";
import { getAuthConfig } from "./auth-config";
import { classifyFailure } from "./org-rewards-errors";
import { reportError } from "./report-error";

/**
 * Organisation rewards admin (PF11). Every call acts for one organisation, sent
 * in `X-Barrels-Organisation`; the API checks membership, role and the
 * `rewards` entitlement. Responses carry no account identities.
 */

const API_PREFIX = /\/api\/v1(?=\/|$)/u;
const RECENT = 25;

function orgClient(accessToken: string, organisationId: string) {
  const config = getAuthConfig();
  // An isolated instance keeps one user's bearer token out of shared server state.
  const client = createClient({
    baseURL: config.authApiBaseUrl,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Barrels-Organisation": organisationId,
    },
    options: { cache: "no-store" },
  });
  client.interceptors.request.use((request) => ({
    ...request,
    url: request.url.replace(API_PREFIX, config.authApiPrefix),
    signal: AbortSignal.timeout(10_000),
  }));
  return client;
}

export function listProgrammes(token: string, organisationId: string) {
  return rewardsListPrograms({
    client: orgClient(token, organisationId),
  }).unwrap();
}

/**
 * Whether to offer the rewards admin for an organisation: false only when the
 * API says it lacks the `rewards` entitlement or the role. A passing failure
 * (outage) still offers the link, since the page explains itself.
 */
export async function canManageRewards(
  token: string,
  organisationId: string
): Promise<boolean> {
  try {
    await listProgrammes(token, organisationId);
    return true;
  } catch (error) {
    const kind = classifyFailure(error);
    if (kind === "not-entitled" || kind === "forbidden") return false;
    reportError(error, "org-rewards-probe");
    return true;
  }
}

export function createProgramme(
  token: string,
  organisationId: string,
  body: ProgramCreate
) {
  return rewardsCreateProgram({
    body,
    client: orgClient(token, organisationId),
  }).unwrap();
}

export function setProgrammePaused(
  token: string,
  organisationId: string,
  programId: string,
  paused: boolean
) {
  const options = {
    client: orgClient(token, organisationId),
    path: { program_id: programId },
  };
  return (
    paused ? rewardsOrgPauseProgram(options) : rewardsOrgResumeProgram(options)
  ).unwrap();
}

export function listEntries(token: string, organisationId: string) {
  return rewardsOrgListEntries({
    client: orgClient(token, organisationId),
    query: { size: RECENT },
  }).unwrap();
}

export function listRedemptions(token: string, organisationId: string) {
  return rewardsOrgListRedemptions({
    client: orgClient(token, organisationId),
    query: { size: RECENT },
  }).unwrap();
}

/** The code is the customer's one-time code; it goes in the body only. */
export function confirmRedemption(
  token: string,
  organisationId: string,
  code: string
) {
  return rewardsConfirmRedemption({
    body: { code },
    client: orgClient(token, organisationId),
  }).unwrap();
}

export function listVenues(token: string, organisationId: string) {
  return rewardsOrgListVenues({
    client: orgClient(token, organisationId),
  }).unwrap();
}

export function createVenue(
  token: string,
  organisationId: string,
  name: string
) {
  return rewardsOrgCreateVenue({
    body: { name },
    client: orgClient(token, organisationId),
  }).unwrap();
}

/** A short-lived venue code. Never cache, log or put it in a URL. */
export function getVenueQrToken(
  token: string,
  organisationId: string,
  venueId: string
) {
  return rewardsOrgGetVenueQrToken({
    client: orgClient(token, organisationId),
    path: { venue_id: venueId },
  }).unwrap();
}

export function listTrails(token: string, organisationId: string) {
  return rewardsOrgListTrails({
    client: orgClient(token, organisationId),
  }).unwrap();
}

export function createTrail(
  token: string,
  organisationId: string,
  body: RewardsTrailCreate
) {
  return rewardsOrgCreateTrail({
    body,
    client: orgClient(token, organisationId),
  }).unwrap();
}

export function updateTrail(
  token: string,
  organisationId: string,
  trailId: string,
  body: RewardsTrailUpdate
) {
  return rewardsOrgUpdateTrail({
    body,
    client: orgClient(token, organisationId),
    path: { trail_id: trailId },
  }).unwrap();
}

export function addTrailStop(
  token: string,
  organisationId: string,
  trailId: string,
  body: RewardsTrailStopCreate
) {
  return rewardsOrgAddTrailStop({
    body,
    client: orgClient(token, organisationId),
    path: { trail_id: trailId },
  }).unwrap();
}

export function listAchievements(token: string, organisationId: string) {
  return rewardsOrgListAchievements({
    client: orgClient(token, organisationId),
  }).unwrap();
}

export function createAchievement(
  token: string,
  organisationId: string,
  body: RewardsAchievementCreate
) {
  return rewardsOrgCreateAchievement({
    body,
    client: orgClient(token, organisationId),
  }).unwrap();
}

export function listChallenges(token: string, organisationId: string) {
  return rewardsOrgListChallenges({
    client: orgClient(token, organisationId),
  }).unwrap();
}

export function createChallenge(
  token: string,
  organisationId: string,
  body: RewardsChallengeCreate
) {
  return rewardsOrgCreateChallenge({
    body,
    client: orgClient(token, organisationId),
  }).unwrap();
}

export function setChallengePaused(
  token: string,
  organisationId: string,
  challengeId: string,
  paused: boolean
) {
  const options = {
    client: orgClient(token, organisationId),
    path: { challenge_id: challengeId },
  };
  return (
    paused
      ? rewardsOrgPauseChallenge(options)
      : rewardsOrgResumeChallenge(options)
  ).unwrap();
}
