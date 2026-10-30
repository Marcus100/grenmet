import "server-only";

import {
  createClient,
  rewardsCreateCheckIn,
  rewardsGetPassport,
  rewardsGetStreak,
  rewardsListMine,
  rewardsListMyAchievements,
  rewardsListMyBadges,
  rewardsListMyTickets,
  rewardsRequestRedemption,
} from "@barrelsgd/api-client";
import { getAuthConfig } from "./auth-config";

/** Tickets, reward cards and trust badges on the Barrels ID account pages (U1). */

const API_PREFIX = /\/api\/v1(?=\/|$)/u;

function bearerClient(accessToken: string) {
  const config = getAuthConfig();
  // An isolated instance keeps one user's bearer token out of shared server state.
  const client = createClient({
    baseURL: config.authApiBaseUrl,
    headers: { Authorization: `Bearer ${accessToken}` },
    options: { cache: "no-store" },
  });
  client.interceptors.request.use((request) => ({
    ...request,
    url: request.url.replace(API_PREFIX, config.authApiPrefix),
    signal: AbortSignal.timeout(10_000),
  }));
  return client;
}

export function listMyTickets(accessToken: string) {
  return rewardsListMyTickets({ client: bearerClient(accessToken) }).unwrap();
}

export function listMyRewardCards(accessToken: string) {
  return rewardsListMine({ client: bearerClient(accessToken) }).unwrap();
}

export function listMyBadges(accessToken: string) {
  return rewardsListMyBadges({ client: bearerClient(accessToken) }).unwrap();
}

export function startRedemption(accessToken: string, programId: string) {
  return rewardsRequestRedemption({
    body: { program_id: programId },
    client: bearerClient(accessToken),
  }).unwrap();
}

export function getMyPassport(accessToken: string) {
  return rewardsGetPassport({ client: bearerClient(accessToken) }).unwrap();
}

export function listMyAchievements(accessToken: string) {
  return rewardsListMyAchievements({
    client: bearerClient(accessToken),
  }).unwrap();
}

export function getMyStreak(accessToken: string) {
  return rewardsGetStreak({ client: bearerClient(accessToken) }).unwrap();
}

/** Post a scanned or typed venue code. Real-world check-ins only. */
export function createCheckIn(accessToken: string, token: string) {
  return rewardsCreateCheckIn({
    body: { token },
    client: bearerClient(accessToken),
  }).unwrap();
}
