"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addTrailStop,
  confirmRedemption,
  createAchievement,
  createChallenge,
  createProgramme,
  createTrail,
  createVenue,
  setChallengePaused,
  setProgrammePaused,
  updateTrail,
} from "@/lib/org-rewards";
import {
  classifyFailure,
  errorDetail,
  FAILURE_TEXT,
} from "@/lib/org-rewards-errors";
import {
  ACHIEVEMENT_RULES,
  CHALLENGE_METRICS,
  checkAchievement,
  isUuid,
  ORGANISATION_ID,
  QUALIFYING_SOURCES,
  TRAIL_KINDS,
  TRAIL_STATUSES,
} from "@/lib/org-rewards-options";
import { reportError } from "@/lib/report-error";
import {
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@/lib/session";
import type { FormState } from "./state";

/**
 * Every action reads the organisation from its own hidden field, checks the
 * shape, and lets the API enforce membership, role and entitlement. Outcomes
 * are returned as text for the form; nothing is put in a URL.
 */

const WHOLE_NUMBER = /^\d{1,7}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Grenada has no daylight saving: always UTC-4. */
const GRENADA_OFFSET = "-04:00";

const fail = (message: string): FormState => ({ message, status: "error" });
const ok = (message: string): FormState => ({ message, status: "ok" });

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function wholeNumber(text: string): number | undefined {
  return WHOLE_NUMBER.test(text) ? Number(text) : undefined;
}

function isOneOf<T extends string>(
  value: string,
  allowed: readonly T[]
): value is T {
  return (allowed as readonly string[]).includes(value);
}

interface Options {
  /** Wording for a 404, which some routes use for "not switched on". */
  readonly notFound?: string;
}

async function perform(
  area: string,
  formData: FormData,
  work: (token: string, organisationId: string) => Promise<string>,
  options: Options = {}
): Promise<FormState> {
  const organisationId = field(formData, "organisation_id");
  const session = await readSessionCookie();
  if (!session) redirect("/");
  if (!ORGANISATION_ID.test(organisationId)) return fail(FAILURE_TEXT.invalid);

  let result: FormState;
  try {
    const { access_token: token } =
      await exchangeSessionForAccessToken(session);
    const message = await work(token, organisationId);
    revalidatePath(`/organisations/${organisationId}/rewards`);
    result = ok(message);
  } catch (error) {
    const kind = classifyFailure(error);
    if (kind === "unauthorised") redirect("/?session=expired");
    reportError(error, area);
    if (kind === "not-found" && options.notFound) {
      result = fail(options.notFound);
    } else if (kind === "invalid") {
      result = fail(errorDetail(error) ?? FAILURE_TEXT.invalid);
    } else {
      result = fail(FAILURE_TEXT[kind]);
    }
  }
  return result;
}

export async function createProgrammeAction(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const name = field(formData, "name");
  const reward = field(formData, "reward_description");
  const source = field(formData, "qualifying_source_type");
  const stamps = wholeNumber(field(formData, "stamps_required"));
  const perSource = wholeNumber(field(formData, "stamps_per_source") || "1");
  const capText = field(formData, "max_redemptions_per_account");
  const cap = capText === "" ? null : wholeNumber(capText);
  if (!(name && reward)) return fail("Fill in every field.");
  if (stamps === undefined || stamps < 1 || stamps > 100) {
    return fail("Stamps required must be a whole number from 1 to 100.");
  }
  if (perSource === undefined || perSource < 1 || perSource > 10) {
    return fail("Stamps per visit must be a whole number from 1 to 10.");
  }
  if (cap === undefined) {
    return fail(
      "The redemption limit must be a whole number, or empty for none."
    );
  }
  if (!QUALIFYING_SOURCES.some((item) => item.key === source)) {
    return fail("Choose what earns a stamp.");
  }
  return await perform(
    "org-rewards-programme-create",
    formData,
    async (token, id) => {
      await createProgramme(token, id, {
        max_redemptions_per_account: cap,
        name,
        qualifying_source_type: source,
        reward_description: reward,
        stamps_per_source: perSource,
        stamps_required: stamps,
      });
      return `Stamp card "${name}" created.`;
    }
  );
}

export async function setProgrammeStatusAction(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const programId = field(formData, "program_id");
  const pause = field(formData, "pause") === "true";
  if (!isUuid(programId)) return fail(FAILURE_TEXT.invalid);
  return await perform(
    "org-rewards-programme-status",
    formData,
    async (token, id) => {
      await setProgrammePaused(token, id, programId, pause);
      return pause ? "Stamp card paused." : "Stamp card resumed.";
    }
  );
}

export async function confirmRedemptionAction(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const code = field(formData, "code");
  if (code.length < 4 || code.length > 32) {
    return fail("Enter the code the customer shows you.");
  }
  return await perform(
    "org-rewards-redeem",
    formData,
    async (token, id) => {
      const done = await confirmRedemption(token, id, code);
      return `Confirmed: ${done.program_name}, ${done.reward_description} (${done.stamps} ${done.stamps === 1 ? "stamp" : "stamps"}). Hand over the reward.`;
    },
    // One message for unknown, used, expired or another organisation's code.
    {
      notFound:
        "That code isn't valid for this organisation, or it was already used.",
    }
  );
}

export async function createVenueAction(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const name = field(formData, "name");
  if (name.length < 1 || name.length > 120) {
    return fail("Name the venue (up to 120 characters).");
  }
  return await perform(
    "org-rewards-venue-create",
    formData,
    async (token, id) => {
      await createVenue(token, id, name);
      return `Venue "${name}" added.`;
    }
  );
}

function dateOrNull(text: string): string | null | undefined {
  if (text === "") return null;
  return DATE.test(text) ? text : undefined;
}

export async function createTrailAction(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const name = field(formData, "name");
  const kind = field(formData, "kind");
  const status = field(formData, "status");
  const startsOn = dateOrNull(field(formData, "starts_on"));
  const endsOn = dateOrNull(field(formData, "ends_on"));
  if (!name) return fail("Name the trail.");
  if (!(isOneOf(kind, TRAIL_KINDS) && isOneOf(status, TRAIL_STATUSES))) {
    return fail(FAILURE_TEXT.invalid);
  }
  if (startsOn === undefined || endsOn === undefined) {
    return fail("Use real dates, or leave them empty.");
  }
  if (startsOn && endsOn && startsOn > endsOn) {
    return fail("The start date can't be after the end date.");
  }
  return await perform(
    "org-rewards-trail-create",
    formData,
    async (token, id) => {
      await createTrail(token, id, {
        description: field(formData, "description"),
        ends_on: endsOn,
        kind,
        name,
        starts_on: startsOn,
        status,
      });
      return `Trail "${name}" created. Add its stops below.`;
    }
  );
}

export async function setTrailStatusAction(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const trailId = field(formData, "trail_id");
  const status = field(formData, "status");
  if (!(isUuid(trailId) && isOneOf(status, TRAIL_STATUSES))) {
    return fail(FAILURE_TEXT.invalid);
  }
  return await perform(
    "org-rewards-trail-status",
    formData,
    async (token, id) => {
      await updateTrail(token, id, trailId, { status });
      return status === "active" ? "Trail activated." : "Trail paused.";
    }
  );
}

export async function addTrailStopAction(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const trailId = field(formData, "trail_id");
  const label = field(formData, "label");
  const venueId = field(formData, "venue_id");
  const required = formData.get("required_check_in") === "on";
  if (!isUuid(trailId)) return fail(FAILURE_TEXT.invalid);
  if (!label) return fail("Name the stop.");
  if (venueId !== "" && !isUuid(venueId)) {
    return fail(FAILURE_TEXT.invalid);
  }
  if (required && venueId === "") {
    return fail("A stop that needs a check-in must have a venue.");
  }
  return await perform(
    "org-rewards-trail-stop",
    formData,
    async (token, id) => {
      await addTrailStop(token, id, trailId, {
        label,
        required_check_in: required,
        venue_id: venueId === "" ? null : venueId,
      });
      return `Stop "${label}" added at the end of the trail.`;
    }
  );
}

export async function createAchievementAction(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const checked = checkAchievement({
    days: field(formData, "days"),
    key: field(formData, "key"),
    n: field(formData, "n"),
    name: field(formData, "name"),
    ruleType: field(formData, "rule_type"),
    trailId: field(formData, "trail_id"),
  });
  if (!checked.ok) return fail(checked.message);
  const rule = field(formData, "rule_type");
  if (
    !isOneOf(
      rule,
      ACHIEVEMENT_RULES.map((item) => item.key)
    )
  ) {
    return fail("Choose a rule.");
  }
  return await perform(
    "org-rewards-achievement-create",
    formData,
    async (token, id) => {
      await createAchievement(token, id, {
        description: field(formData, "description"),
        key: field(formData, "key"),
        name: field(formData, "name"),
        parameters: { ...checked.parameters },
        rule_type: rule,
      });
      return `Achievement "${field(formData, "name")}" created.`;
    }
  );
}

function grenadaInstant(date: string, time: string): string | undefined {
  if (!DATE.test(date)) return;
  const instant = new Date(`${date}T${time}${GRENADA_OFFSET}`);
  return Number.isNaN(instant.getTime()) ? undefined : instant.toISOString();
}

const NOT_ENABLED =
  "Challenges aren't enabled for your organisation yet. They are switched on in stages.";

export async function createChallengeAction(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const name = field(formData, "name");
  const metric = field(formData, "metric");
  const target = wholeNumber(field(formData, "target_total"));
  const startsAt = grenadaInstant(field(formData, "starts_on"), "00:00:00");
  const endsAt = grenadaInstant(field(formData, "ends_on"), "23:59:59");
  if (!name) return fail("Name the challenge.");
  if (
    !isOneOf(
      metric,
      CHALLENGE_METRICS.map((item) => item.key)
    ) ||
    target === undefined ||
    target < 1 ||
    target > 1_000_000
  ) {
    return fail("Pick what counts and a target from 1 to 1,000,000.");
  }
  if (!(startsAt && endsAt) || startsAt >= endsAt) {
    return fail("Choose a start date before the end date.");
  }
  return await perform(
    "org-rewards-challenge-create",
    formData,
    async (token, id) => {
      await createChallenge(token, id, {
        description: field(formData, "description"),
        ends_at: endsAt,
        metric,
        name,
        reward_description: field(formData, "reward_description"),
        starts_at: startsAt,
        target_total: target,
      });
      return `Challenge "${name}" created.`;
    },
    { notFound: NOT_ENABLED }
  );
}

export async function setChallengeStatusAction(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const challengeId = field(formData, "challenge_id");
  const pause = field(formData, "pause") === "true";
  if (!isUuid(challengeId)) return fail(FAILURE_TEXT.invalid);
  return await perform(
    "org-rewards-challenge-status",
    formData,
    async (token, id) => {
      await setChallengePaused(token, id, challengeId, pause);
      return pause ? "Challenge paused." : "Challenge resumed.";
    },
    { notFound: NOT_ENABLED }
  );
}
