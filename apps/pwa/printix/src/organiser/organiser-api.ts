// The organiser's read-only calls. Every answer must match the generated schema,
// or it is a failure: the screen never shows an unvalidated number.

import {
  type PrintixEventPage,
  type PrintixEventSummary,
  type PrintixOrganiserOrganisation,
  printixListMyOrganiserOrganisations,
  printixListMyOrganiserOrganisationsResponseSchema,
  printixListOrgEvents,
  printixListOrgEventsResponseSchema,
  printixOrgEventSummary,
  printixOrgEventSummaryResponseSchema,
} from "@barrelsgd/api-client";
import { failed, invalidResponse, type Outcome } from "@/organiser/errors";
import type { OrganiserSession } from "@/organiser/session";

/** Events per page. The server allows up to 1000; 50 keeps a phone screen short. */
export const EVENTS_PAGE_SIZE = 50;

const REQUEST_TIMEOUT_MS = 15_000;

/** The header that names the organisation a call acts for (org routes). */
function organisationHeader(organisationId: string): Record<string, string> {
  return { "X-Barrels-Organisation": organisationId };
}

/** The organisations this person may run Printix for, with what they may do in each. */
export async function listOrganisations(
  session: OrganiserSession
): Promise<Outcome<PrintixOrganiserOrganisation[]>> {
  try {
    const data = await session.call(async () => {
      const response = await printixListMyOrganiserOrganisations({
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return response.data;
    });
    const parsed =
      printixListMyOrganiserOrganisationsResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw invalidResponse();
    }
    return { ok: true, value: parsed.data };
  } catch (error) {
    return failed(error, "organiser-organisations");
  }
}

/** One page of the organisation's events, newest date first. */
export async function listEvents(
  session: OrganiserSession,
  organisationId: string,
  page: number
): Promise<Outcome<PrintixEventPage>> {
  try {
    const data = await session.call(async () => {
      const response = await printixListOrgEvents({
        query: { page, size: EVENTS_PAGE_SIZE },
        headers: organisationHeader(organisationId),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return response.data;
    });
    const parsed = printixListOrgEventsResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw invalidResponse();
    }
    return { ok: true, value: parsed.data };
  } catch (error) {
    return failed(error, "organiser-events");
  }
}

/** The live counts for one event of the organisation. */
export async function readEventSummary(
  session: OrganiserSession,
  organisationId: string,
  eventId: string
): Promise<Outcome<PrintixEventSummary>> {
  try {
    const data = await session.call(async () => {
      const response = await printixOrgEventSummary({
        path: { event_id: eventId },
        headers: organisationHeader(organisationId),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return response.data;
    });
    const parsed = printixOrgEventSummaryResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw invalidResponse();
    }
    return { ok: true, value: parsed.data };
  } catch (error) {
    return failed(error, "organiser-summary");
  }
}
